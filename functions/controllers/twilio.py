import json
import time
from time import sleep

from google.cloud.firestore_v1 import FieldFilter
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from twilio.rest import Client

from controllers.artists import artist_with_meta
from lib import SpotifyClient, Artist, OrganizationArtist, ErrorResponse


class TwilioController():

  def __init__(self, spotify: SpotifyClient, account, token, verify, message):
    self.spotify = spotify
    account_sid = account
    self.client = Client(account_sid, token)
    self.verify_service = verify
    self.message_service = message

  def load_user_ref(self, uid, db):
    ref = db.collection("users").document(uid)
    return ref.get(), ref

  def send_code(self, uid, db, number):
    verification = self.client.verify \
      .v2 \
      .services(self.verify_service) \
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
      self.verify_service
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

  def receive_message(self, db, from_number, message, link_proc, sql_session):
    print(str(from_number) + ": " + str(message))
    user = db.collection("users").where(filter=FieldFilter("sms.number", "==", from_number)).where(filter=FieldFilter("sms.verified", "==", True)).limit(1)
    user = user.get()
    if len(user) == 0:
      return {
        "processed": False,
      }
    else:
      return self.process_message(user[0], from_number, message, link_proc, sql_session)

  def process_message(self, user, from_number: str, message: str, link_proc, sql_session):
    lowered = message.lower().strip()
    sent = False
    user_data = user.to_dict()
    pending_import = user_data.get('pending_import', None)

    if pending_import is not None:
      if lowered == 'y' or lowered == 'yes':
        link_proc(sql_session, user.id, pending_import.get('url'), None, False)
      user.update({'pending_import': None})
    data = None
    print("Received twilio text", message, lowered)
    try:
      if lowered == 'help':
        sent = False
        # sent = self.send_message(user_data, "Send a Spotify artist or playlist link to add to your organization or retrieve stats!")
      elif 'open.spotify.com' in lowered:
        print("Spotify link detected")
        spotify_id = self.spotify.url_to_id(message)
        if spotify_id == 'invalid':
          spotify_id = self.spotify.url_to_id(message, 'playlist')
          if spotify_id == 'invalid':
            sent = self.send_message(user_data,
                                     "The link you provided is not a valid Spotify artist or playlist URL.")
            print("invalid link")
            data = None
          else:
            data = link_proc(sql_session, user.id, message, None, True)
            print("link data", str(data))
        else:
          artist_query = (select(Artist)
                          .options( joinedload(Artist.organizations, innerjoin=True))
                          .where(Artist.spotify_id == spotify_id)
                          .where(Artist.organizations.any(OrganizationArtist.organization_id == user_data.get('organization'))))
          artist_existing = sql_session.scalars(artist_query).unique().first()
          if artist_existing is None:
            try:
              data = link_proc(sql_session, user.id, message, None, False)
              artist_existing = sql_session.scalars(artist_query).unique().first()
            except ErrorResponse as e:
              artist_existing = sql_session.scalars(artist_query).unique().first()
              if artist_existing is None:
                data = None
                raise e

            print("new found data", str(data))
            if artist_existing is not None:
              data = {
                "found": True,
                "type": "artist",
                "name": artist_existing.name,
                "new": artist_existing.id
              }
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
            print("new data", str(data))
        if data is not None and data.get('found', False) == False and ~sent:
          sent = self.send_message(user_data, "We were unable to process the link you provided. Please double check or try again in a minute.")
        elif data is not None:
          if data.get('type') == 'artist':
            if data.get('existing') is not None:
              sent = self.send_template(user_data, "HXabba02580e40f6bbf0e0c1ddac752a36", dict({"1": data.get("name"), "2": "https://indiestack.app/app/artists/" + str(data.get('existing'))}))
              artist_data = artist_with_meta(sql_session=sql_session, spotify_id=None, artist_id=data.get('existing'))
              if artist_data is not None and len(artist_data.statistics) > 0:
                sleep(0.25)
                self.send_artist_stats(user_data, artist_data)
              # sent = self.send_template(user_data, "HXabba02580e40f6bbf0e0c1ddac752a36", dict({"1": data.get("name"), "2": "https://google.com"}))
            else:
              sent = self.send_template(user_data, "HXf2f85e6870b94efefd58e668c95008ce", dict({"1": data.get("name"), "2": "https://indiestack.app/app/artists/" + str(data.get("new"))}))
          else:
            if data.get('existing') is not None:
              user.update({
                "pending_import": data
              })
              sent = self.send_message(user_data, "Successfully found playlist: " + data.get("name") + ". This playlist was already imported on " + data.get('existing_created_at').strftime('%Y-%m-%d') + ". Reimport anyways? (Y/N)")
            else:
              user.update({
                "pending_import": data
              })
              sent = self.send_message(user_data, "Successfully found playlist: " + data.get("name") + ". Import artists? (Y/N)")


    except ErrorResponse as e:
      print(str(e))
      if ~sent:
        sent = self.send_message(user_data, "There was an unexpected error while processing your request. Please try again in a little while.")

      return {
        "processed": False,
        "sent": sent
      }
    return {
      "processed": True,
      "sent": sent
    }

  def send_template(self, user: dict, template: str, vars: dict):
    verified = user.get('sms', {}).get('verified', False)
    if verified is False:
      return False
    self.client.messages.create(
      content_sid=template,
      to=user.get('sms').get('number'),
      messaging_service_sid=self.message_service,
      content_variables=json.dumps(vars),
    )
    return True

  def format_number(self, num):
    if num >= 1e9:
      return f"{num / 1e9:.1f}B"
    elif num >= 1e6:
      return f"{num / 1e6:.1f}M"
    elif num >= 1e3:
      return f"{num / 1e3:.1f}K"
    else:
      return str(num)

  def send_artist_stats(self, user: dict, artist: Artist, on_retrieve = False):
    print("Converting stats to text")
    text = "Audience Stats for \"" + artist.name + "\":\n"
    if on_retrieve:
      text = "We finished retrieving " + text
    for stat in artist.statistics:
      text += stat.type.source.title() + " " + stat.type.name + ": " + self.format_number(stat.latest) + " " + ("+" if stat.week_over_week > 0 else "") + f"{round(stat.week_over_week * 100, 2):,}" + "%\n"
    self.send_message(user, text)

  def send_message(self, user: dict, message: str):
    print(message)
    verified = user.get('sms', {}).get('verified', False)
    if verified is False:
      return False

    self.client.messages.create(
      body=message,
      messaging_service_sid=self.message_service,
      to=user.get('sms').get('number'),
    )
    return True