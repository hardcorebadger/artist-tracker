import os
import time

from google.cloud.firestore_v1 import FieldFilter
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from twilio.rest import Client

from lib import SpotifyClient, Artist, OrganizationArtist
from tmp_keys import *


class TwilioController():

  def __init__(self, sql, spotify: SpotifyClient):
    self.sql = sql
    self.spotify = spotify
    account_sid = 'AC0e6af46378b5bfa7347d4aaba73709f6'
    self.client = Client(account_sid, TWILIO_TOKEN)

  def load_user_ref(self, uid, db):
    ref = db.collection("users").document(uid)
    return ref.get(), ref

  def send_code(self, uid, db, number):
    verification = self.client.verify \
      .v2 \
      .services(TWILIO_VERIFY_SERVICE) \
      .verifications \
      .create(to=number, channel='sms')
    user, user_ref = self.load_user_ref(uid, db)
    user_ref.update({'sms': {
      "verify_id": verification.sid,
      "check_id": None,
      "number": number,
      "verified": verification.status == 'approved',
      "code_sent_at": time.time(),
      "verified_at": None
    }})
    return verification.sid

  def verify_code(self, uid, db, number, code):
    verification_check = self.client.verify.v2.services(
      TWILIO_VERIFY_SERVICE
    ).verification_checks.create(to=number, code=code)
    if verification_check.status == 'approved':
      user, user_ref = self.load_user_ref(uid, db)

      user_ref.update({'sms': {
        "verify_id": user.get('sms').get('verify_id'),
        "check_id": verification_check.sid,
        "number": number,
        "verified": verification_check.status == 'approved',
        "code_sent_at": user.get('sms').get('code_sent_at'),
        "verified_at": time.time()
      }})

      return True, None
    else:
      return False, verification_check.status

  def receive_message(self, db, from_number, message, link_proc):
    user = db.collection("users").where(filter=FieldFilter("sms.number", "==", from_number)).where(filter=FieldFilter("sms.verified", "==", True)).limit(1)
    user = user.get()
    if len(user) == 0:
      return {
        "processed": False,
      }
    else:
      return self.process_message(user[0], from_number, message, link_proc)

  def process_message(self, user, from_number: str, message: str, link_proc):
    lowered = message.lower().strip()
    sent = False
    sql_session = self.sql.get_session()
    user_data = user.to_dict()
    pending_import = user_data.get('pending_import', None)

    if pending_import is not None:
      if lowered == 'y' or lowered == 'yes':
        link_proc(user.id, pending_import.get('url'), None, False)

        print(pending_import)
      else:
        print(pending_import)
      user.update({'pending_import': None})

    if lowered == 'help':
      sent = self.send_message(user_data, "Send a Spotify artist or playlist link to add to your organization or retrieve stats!")
    elif 'open.spotify.com' in lowered:
      spotify_id = self.spotify.url_to_id(message)
      if spotify_id == 'invalid':
        spotify_id = self.spotify.url_to_id(message, 'playlist')
        if spotify_id == 'invalid':
          sent = self.send_message(user_data,
                                   "The link you provided is not a valid Spotify artist or playlist URL.")
          data = None
        else:
          data = link_proc(user.id, message, None, True)
      else:
        artist_query = (select(Artist)
                        .options(
          joinedload(Artist.organizations, innerjoin=True),
        )
                        .where(Artist.spotify_id == spotify_id)
                        .where(
          Artist.organizations.any(OrganizationArtist.organization_id == user_data.get('organization'))))
        artist_existing = sql_session.scalars(artist_query).unique().first()
        if artist_existing is None:
          data = link_proc(user.id, message, None, False)
        else:
          org = None
          if artist_existing is not None:
            org = list(
              filter(lambda x: x.organization_id == user_data.get('organization'), artist_existing.organizations)).pop()
          data = {
            "found": True,
            "type": "artist",
            "name": artist_existing.name,
            "existing": artist_existing.id,
            "existing_created_at": org.created_at
          }
      if data is not None and data.get('found', False) == False:
        sent = self.send_message(user_data, "We were unable to process the link you provided. Please double check or try again in a minute.")
      elif data is not None:
        if data.get('type') == 'artist':
          if data.get('existing') is not None:
            sent = self.send_message(user_data, "The artist: " + data.get('name') + " is in your organization. Here is the link to see their information: " + "https://artist-tracker-e5cce.web.app/app/artists/" + str(data.get('existing')))
          else:
            artist_sql = sql_session.scalars(select(Artist).where(Artist.spotify_id == spotify_id)).first()
            sent = self.send_message(user_data, "The artist: " + data.get('name') + " has been added to your organization. Here is the link to see their information: " + "https://artist-tracker-e5cce.web.app/app/artists/" + str(artist_sql.id))
        else:
          if data.get('existing') is not None:
            sent = self.send_message(user, "Successfully found playlist: " + data.get("name") + ". This playlist was already imported on " + data.get('existing_created_at') + ".")
          else:
            user.update({
              "pending_import": data
            })
            sent = self.send_message(user, "Successfully found playlist: " + data.get("name") + ". Import artists? (Y/N)")


    sql_session.close()

    return {
      "processed": True,
      "sent": sent
    }

  def send_message(self, user: dict, message: str):
    print(message)
    verified = user.get('sms', {}).get('verified', False)
    if verified is False:
      return False

    self.client.messages.create(
      body=message,
      messaging_service_sid=TWILIO_MESSAGE_SERVICE,
      to=user.get('sms').get('number'),
    )
    return True