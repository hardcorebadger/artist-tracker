import os
import time

from google.cloud.firestore_v1 import FieldFilter
from twilio.rest import Client

from tmp_keys import *


class TwilioController():

  def __init__(self, sql):
    self.sql = sql
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

  def receive_message(self, db, from_number, message):
    user = db.collection("users").where(filter=FieldFilter("sms.number", "==", from_number)).where(filter=FieldFilter("sms.verified", "==", True)).limit(1)
    user = user.get()
    if len(user) == 0:
      return {
        "processed": False,
      }
    else:
      return self.process_message(user[0].to_dict(), from_number, message)

  def process_message(self, user: dict, from_number: str, message: str):
    lowered = message.lower().strip()
    sent = False
    if lowered == 'help':
      sent = self.send_message(user, "No!")

    return {
      "processed": True,
      "sent": sent
    }

  def send_message(self, user: dict, message: str):
    verified = user.get('sms', {}).get('verified', False)
    print(verified)
    if verified is False:
      return False

    self.client.messages.create(
      body=message,
      messaging_service_sid=TWILIO_MESSAGE_SERVICE,
      to=user.get('sms').get('number'),
    )
    return True