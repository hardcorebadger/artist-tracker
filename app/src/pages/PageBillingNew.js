import {useEffect, useState} from 'react';
import {
  AlertIcon,
  Text,
  Alert,
  VStack,
  Input,
  Grid,
  Button,
  Heading,
  GridItem,
  Divider,
  HStack,
  Avatar,
  Link,
  Badge,
  Card,
  Stack, useToast,
} from '@chakra-ui/react';
import { PageLayoutContained } from '../layouts/DashboardLayout';
import { updateEmail, updatePassword } from "firebase/auth";
import { signInWithEmailAndPassword, signInWithGoogle, auth, db, functions } from '../firebase';
import { useUser } from '../routing/AuthGuard';
import { updateDoc, doc, startAfter } from 'firebase/firestore';
import { products } from '../config';
import { Link as RouterLink } from 'react-router-dom';
import AnnotadedSection from '../components/AnnotatedSection';
import { useDocument } from 'react-firebase-hooks/firestore';
import { httpsCallable } from 'firebase/functions';
import {goFetch} from "../App";
import Iconify from "../components/Iconify";
import {LoadingWidget} from "../routing/LoadingScreen";

String.prototype.ucwords = function() {
  const str = this.toLowerCase();
  return str.replace(/(^([a-zA-Z\p{M}]))|([ -][a-zA-Z\p{M}])/g,
      function(s){
        return s.toUpperCase();
      });
};

function PaymentInfo({subscription}) {

  if (subscription?.payment_method_details === null || subscription?.payment_method_details.type !== 'card') {
    return (
        <Text>{subscription.payment_method_details ? subscription.payment_method_details.type.ucwords() : "N/A"}</Text>
    )
  }



  return (
      <HStack>
        <Iconify size={'30px'} icon={'icons8:' + subscription.payment_method_details.card.brand}/>
        <Text>{subscription.payment_method_details.card.last4}</Text>

      </HStack>
  )

}


function SubscriptionCard({user, subscription, activeSubscription}) {
  const [manageLoading, setManageLoading] = useState(false);
  const pricing = {
    price : "$"+(subscription.amount/100),
    suffix : subscription.payment_interval === 'ltd' ? "" : " / "+subscription.payment_interval
  }
  const toast = useToast();

  let badge_color = 'green'
  const s = subscription.status
  const cancelled_or_expired = (s === 'canceled' || s ==='expired' || s === 'paused')
  if (cancelled_or_expired)
    badge_color = 'red'
  else if (s === 'on_trial')
    badge_color = 'yellow'

  const renew_prefix = cancelled_or_expired ? 'Expires on' : s === 'on_trial' ? 'Trial ends on' : 'Next billing date'

  const status = s === 'canceled' ? 'cancelled'.ucwords() : s.ucwords()

  const manageSub = async () => {
    setManageLoading(true);
    goFetch(user, 'POST','subscription-portal', {
      subscription_id: subscription.id,
    }).then((response) => {
      console.log(response);
      setManageLoading(false);
      if (response.hasOwnProperty("url")) {
        window.open(response.url, '_blank');
      } else {
        toast({
          title: 'Failed to load billing profile',
          description: "We were unable to generate a link for your Stripe profile.",
          status: 'failed',
          duration: 9000,
          isClosable: true,
        })
      }
    })
  }


  return (
    <Card p={30} mb={2}>
        <Stack spacing={6}>
          <Grid
          templateRows={['1fr']}
          templateColumns={['1fr', '1fr', '1fr 1fr']}
          gap={4}
          >
            <GridItem sx={{minWidth: '300px'}}>
                <HStack align="center" spacing={3}>
                  <Heading size="md">Indiestack Trial</Heading>
                  <Badge colorScheme={badge_color}>{status}</Badge>
                </HStack>
            </GridItem>
            <GridItem>
              <HStack align="center" justifyContent={['start', 'start', 'end']} spacing={3}><Heading size="md">{pricing.price}</Heading><Text>{pricing.suffix}</Text></HStack>
            </GridItem>
          </Grid>
          <VStack spacing={1} align="left">
            <HStack align="center" spacing={3}>
              <Text color="text.subtle">Payment method</Text>
              <PaymentInfo subscription={subscription} />
            </HStack>
            <HStack align="center" spacing={3}><Text color="text.subtle">{renew_prefix}</Text><Text>{new Date(subscription.renews_at).toLocaleDateString()}</Text></HStack>
          </VStack>
          {!cancelled_or_expired || activeSubscription === false ? (
              <HStack align="center" spacing={3}>

                <Button colorScheme='primary' isLoading={manageLoading} onClick={manageSub}>Manage</Button>
              </HStack>
          ): null}

        </Stack>
      </Card>
  )
}

function Subscriptions({subscriptions, activeSubscription}) {

  const user = useUser()




  return (
    <AnnotadedSection title="Subscriptions" description="Information on your active subscription(s)">
      {subscriptions?.map((subscription) => {
          return (
              <SubscriptionCard  user={user} subscription={subscription} activeSubscription={activeSubscription} key={subscription.id}/>
          )
      })}
      {subscriptions?.length === 0 ? (
          <VStack>
            <Iconify size={'30px'} icon={'ph:empty'}/>
            <Text>No Subscriptions</Text>
          </VStack>
      ) : null}


    </AnnotadedSection>
  )
}

export default function PageBillingNew() {
  const disableEmailPass = auth.currentUser.providerData[0].providerId !== 'password'
  const user = useUser()
  const [subscriptions, setSubscriptions] = useState(null)
  const [subscribeLoading, setSubscribeLoading] = useState(false)
  const toast = useToast()
  const [activeSubscription, setActiveSubscription] = useState(null)
  useEffect(() => {
    goFetch(user, 'GET','subscriptions').then((response) => {
      setSubscriptions(response)
      let active = null
      for (let x in response) {
        const sub = response[x]
        if (sub['status'] === 'active' || sub['status'] === 'paused') {
          active = sub
          break;
        }
      }
      if (active === null) {
        setActiveSubscription(false)
      } else {
        setActiveSubscription(active)
      }
    })

  }, [])
  useEffect(() => {}, [subscriptions, activeSubscription])

  const checkout = async () => {
    setSubscribeLoading(true);
    goFetch(user, 'POST','checkout', {
    }).then((response) => {
      console.log(response);
      setSubscribeLoading(false);
      if (response.hasOwnProperty("checkout")) {
        window.open(response.checkout.url, '_blank');
      } else {
        toast({
          title: 'Failed to generate checkout',
          description: "We were unable to generate a link for your Stripe checkout.",
          status: 'error',
          duration: 9000,
          isClosable: true,
        })
      }
    }).catch((error) => {
      setSubscribeLoading(false);

      toast({
        title: 'Failed to generate checkout',
        description: "We were unable to generate a link for your Stripe checkout.",
        status: 'error',
        duration: 9000,
        isClosable: true,
      })
    })
  }
  console.log(activeSubscription)

  return (
      <PageLayoutContained size="md">
        <VStack spacing={8} align="left">
          <HStack mb={8} align={'center'} justify={'space-between'}>

            <Heading >Billing</Heading>
            <Button disabled={activeSubscription !== false && activeSubscription !== null} isLoading={subscribeLoading} onClick={checkout}>Subscribe</Button>
          </HStack>
          {subscriptions === null ? <LoadingWidget height={'30vh'}/> : <Subscriptions subscriptions={subscriptions} activeSubscription={activeSubscription} />}

          <Divider/>

        </VStack>
      </PageLayoutContained>
  );
}
