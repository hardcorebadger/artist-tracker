from google.cloud.firestore_v1 import Client
import uuid
from datetime import datetime, timedelta, date
from lib.models import ArtistAlert
import json

class AlertController():
  def __init__(self, db: Client, artist_controller, sql_session):
    self.db = db
    self.artist_controller = artist_controller
    self.sql_session = sql_session

  def _serialize_for_firestore(self, obj):
    """Convert objects to Firestore-serializable format"""
    if isinstance(obj, uuid.UUID):
      return str(obj)
    elif isinstance(obj, (datetime, date)):
      return obj.isoformat() + "Z"
    elif isinstance(obj, dict):
      return {k: self._serialize_for_firestore(v) for k, v in obj.items()}
    elif isinstance(obj, list):
      return [self._serialize_for_firestore(item) for item in obj]
    return obj

  def run_alerts(self):
    alerts = self.db.collection("alerts").get()
    for alert in alerts:
      self.run_alert(alert.id)

  def run_alert(self, alert_id: str):
    print(f"Running alert {alert_id}")
    alert_ref = self.db.collection("alerts").document(alert_id)
    alert_doc = alert_ref.get()
    if not alert_doc.exists:
      return
    print(f"Alert {alert_id} found")
    alert = alert_doc.to_dict()
    if alert.get("disabled", False):
      return
    print(f"Alert {alert_id} not disabled")
    org_id = alert.get("organization_id")
    print(f"Org ID: {org_id}")
    # Get organization document to find a user ID
    org_doc = self.db.collection("organizations").document(org_id).get()
    if not org_doc.exists:
      print(f"Organization {org_id} not found")
      return
    org_data = org_doc.to_dict()
    print(f"Org data: {org_data}")
    users = org_data.get("users", {})
    if not users:
      print(f"No users found in organization {org_id}")
      return
    print(f"Users: {users}")
    # Use the first user's ID from the organization
    uid = list(users.keys())[0]
    print(f"Using user ID: {uid}")
    data = {"filterModel": {"items": alert.get("items", [])}}
    data["page"] = 0
    data["pageSize"] = 10000
    print(f"Data: {data}")
    artists = self.artist_controller.get_artists(
      uid=uid,
      data=data,
      app=None,
      sql_session=self.sql_session,
      ids_only=False
    )["rows"]
    print(f"Found {len(artists)} artists")
    to_alert = []
    one_week_ago = datetime.utcnow() - timedelta(weeks=1)
    
    # Get all artist IDs that pass the cooldown check in one query
    artist_ids = [artist["id"] for artist in artists]
    if not artist_ids:
      print("No artists to check")
      return
      
    # Find artists that don't have a recent alert entry
    artists_in_cooldown = self.sql_session.query(ArtistAlert.artist_id).filter(
      ArtistAlert.artist_id.in_(artist_ids),
      ArtistAlert.organization_id == org_id,
      ArtistAlert.alert_id == alert_id,
      ArtistAlert.sent_on > one_week_ago
    ).all()
    artists_in_cooldown = {row[0] for row in artists_in_cooldown}  # Convert to set for O(1) lookup
    
    # Filter artists that aren't in cooldown
    to_alert = [artist for artist in artists if artist["id"] not in artists_in_cooldown]
    print(f"To alert: {len(to_alert)}")
    
    # Prepare batch SQL inserts
    alert_rows = []
    for artist in to_alert:
      alert_rows.append({
        "artist_id": artist["id"],
        "organization_id": org_id,
        "alert_id": alert_id,
        "send_id": str(uuid.uuid4()),
        "sent_on": datetime.utcnow()
      })
    
    # Prepare batch Firestore writes
    batch = self.db.batch()
    alert_messages = []
    for artist in to_alert:
      alert_message = {
        "alert": self._serialize_for_firestore(alert),  # Serialize alert data
        "artist": self._serialize_for_firestore(artist),  # Serialize artist data
        "organization_id": org_id,
        "triggeredAt": datetime.utcnow().isoformat() + "Z"
      }
      alert_messages.append(alert_message)
    
    # Execute SQL batch insert
    if alert_rows:
      self.sql_session.bulk_insert_mappings(ArtistAlert, alert_rows)
      self.sql_session.commit()
      print(f"Bulk inserted {len(alert_rows)} alert rows")
    
    # Execute Firestore batch write
    if alert_messages:
      # Firestore batches are limited to 500 operations
      for i in range(0, len(alert_messages), 500):
        batch = self.db.batch()
        chunk = alert_messages[i:i + 500]
        for message in chunk:
          doc_ref = self.db.collection("alert_messages").document()
          batch.set(doc_ref, message)
        batch.commit()
        print(f"Committed batch of {len(chunk)} alert messages")
    
    print(f"Finished processing alert {alert_id}")

# Artist Alerts Table SQL
# 
# -- CreateTable
# CREATE TABLE "artist_alerts" (
#     "id" SERIAL NOT NULL,
#     "artist_id" UUID NOT NULL,
#     "organization_id" VARCHAR(28) NOT NULL,
#     "alert_id" VARCHAR(128) NOT NULL,
#     "send_id" VARCHAR(128) NOT NULL,
#     "sent_on" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

#     CONSTRAINT "artist_alerts_pkey" PRIMARY KEY ("id")
# );

# -- CreateIndex
# CREATE INDEX "artist_alerts_cooldown" ON "artist_alerts"("artist_id", "organization_id", "alert_id", "sent_on");

# -- CreateIndex
# CREATE UNIQUE INDEX "artist_alerts_unique" ON "artist_alerts"("artist_id", "organization_id", "alert_id");

# -- AddForeignKey
# ALTER TABLE "artist_alerts" ADD CONSTRAINT "artist_alerts_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

