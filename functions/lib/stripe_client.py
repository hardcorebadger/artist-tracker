import datetime
import hashlib
import json
import os

import stripe
from flask import jsonify
from sqlalchemy import select

from lib import Subscription
def generate_random_hash():
  """Generates a random hash using os.urandom and hashlib."""
  random_bytes = os.urandom(32)  # Generate 32 random bytes
  hashed_value = hashlib.sha256(random_bytes).hexdigest() # Hash the bytes using SHA-256 and return a hexadecimal string
  return hashed_value

# This is your test secret API key.
class StripeController():

    def __init__(self, api_key, webhook_secret):
        self.REDIRECT_URL = "https://indiestack.app/app/settings/billing"
        self.PRODUCT_ID = "price_1Qm504BqdR0twCRHpFzPtS0s"
        self.ADMIN_PRODUCT_ID = "price_1Qm5EXBqdR0twCRHbAD4Y7rq"
        self.live = True
        if "_test" in api_key:
            self.live = False
            self.REDIRECT_URL = "http://localhost:3000/app/settings/billing"
            self.PRODUCT_ID = "price_1Qlz5hBqdR0twCRHZeCk6Jmd"
        stripe.api_key = api_key
        self.webhook_secret = webhook_secret

    def generate_checkout(self, organization_id, is_admin, sql_session):
        try:
            subscription = Subscription(
                organization_id=organization_id,
                amount=0,
                status="new",
                live=self.live
            )
            sql_session.add(subscription)
            sql_session.commit()

            checkout_session = stripe.checkout.Session.create(
                line_items=[
                    {
                        # Provide the exact Price ID (for example, pr_1234) of the product you want to sell
                        'price': self.PRODUCT_ID if is_admin == False else self.ADMIN_PRODUCT_ID,
                        'quantity': 1,
                    },
                ],
                mode='subscription',
                client_reference_id=subscription.id,
                success_url=self.REDIRECT_URL + '?success=true',
                cancel_url=self.REDIRECT_URL + '?canceled=true',
                subscription_data={"metadata": {
                    "subscription_id": subscription.id,
                }},
                automatic_tax={'enabled': True},
            )

            subscription.amount = checkout_session['amount_total']
            subscription.status = 'open'
            subscription.checkout_id = checkout_session['id']
            sql_session.add(subscription)
            sql_session.commit()

        except Exception as e:
            return str(e)



        return checkout_session

    def webhook(self, request, sql_session):

        event = None
        payload = request.data
        sig_header = request.headers.get('Stripe-Signature')
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, self.webhook_secret
            )
            print(event['type'])
        except ValueError as e:
            # Invalid payload
            print('Error parsing payload: {}'.format(str(e)))
            return jsonify({'error': 'Invalid payload'}), 400
        except stripe.error.SignatureVerificationError as e:
            # Invalid signature
            print('Error verifying webhook signature: {}'.format(str(e)))
            return jsonify({'error': 'Invalid signature'}), 400

        if event['type'] == 'checkout.session.completed':
            client_reference = event.data.get('object')['client_reference_id']
            subscription = sql_session.scalars(select(Subscription).where(Subscription.id == int(client_reference))).first()
            if subscription is None:
                print('Error verifying checkout session reference: {}'.format(str(client_reference)))
                return jsonify({'error': 'Invalid session reference'}), 400
            subscription.status = 'active'
            subscription.subscription_id = event.data.get('object')['subscription']
            subscription.customer_id = event.data.get('object')['customer']
            sql_session.add(subscription)
            sql_session.commit()
            print("Processed Checkout Complete")
        elif event['type'] == 'customer.subscription.updated':
            print(event)
            subscription_id = event.data.get('object')['id']
            subscription_data = event.data.get('object')
            subscription_metadata = subscription_data.get('metadata')
            our_subscription_id = None
            if subscription_metadata is not None:
                if 'subscription_id' in subscription_metadata:
                    our_subscription_id = subscription_metadata['subscription_id']

            if our_subscription_id is not None:
                subscription = sql_session.scalars(select(Subscription).where(Subscription.id == int(our_subscription_id))).first()
            else:
                subscription = sql_session.scalars(select(Subscription).where(Subscription.subscription_id == str(subscription_id))).first()
            if subscription is None:
                print('Error verifying customer subscription reference: {}'.format(str(subscription_id)))
                return jsonify({'error': 'Invalid subscription reference'}), 400

            subscription.subscription_id = subscription_id
            subscription.status = subscription_data['status']
            if subscription_data['canceled_at']:
                subscription.status = 'canceled'
            subscription.payment_interval = subscription_data['plan']['interval']
            subscription.payment_method_id = subscription_data['default_payment_method']
            if subscription_data['default_payment_method']:
                method = stripe.Customer.retrieve_payment_method(
                    subscription_data['customer'],
                    subscription_data['default_payment_method'],
                )
                subscription.payment_method_details = method.to_dict()
            else:
                subscription.payment_method_details = None

            subscription.renews_at = datetime.datetime.fromtimestamp(subscription_data['current_period_end'])
            sql_session.add(subscription)
            sql_session.commit()
            print("Processed Subscription Update ["+event['type']+"]")
        # Handle the event
        elif event['type'] == 'payment_intent.succeeded':
            payment_intent = event['data']['object']  # contains a stripe.PaymentIntent
            print('PaymentIntent was successful!')
        elif event['type'] == 'payment_method.attached':
            payment_method = event['data']['object']  # contains a stripe.PaymentMethod
            print('PaymentMethod was attached to a Customer!')
        # ... handle other event types
        else:
            print('Unhandled event type {}'.format(event['type']))
        return "Success", 200

    def cancel_checkout(self, checkout_id):
        stripe.checkout.Session.expire(checkout_id)

    def portal_url(self, customer_id):
        return stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url="https://indiestack.app/app/settings/billing",
        ).to_dict()
