import {useState} from 'react';
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
  Stack,
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

function SubscriptionCard({product}) {
  const [actionLoading, setActionLoading] = useState(false)
  const [subscription, loading, error] = useDocument(
    doc(db, 'subscriptions', product.subscription),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  )

  if (loading || subscription === undefined || !subscription) {
    return <></>
  }

  const attributes = subscription.data().attributes

  const pricing = {
    price : "$"+(product.price/100),
    suffix : product.interval === 'ltd' ? "" : " / "+product.interval
  }

  let badge_color = 'green'
  const s = attributes.status
  const cancelled_or_expired = (s === 'cancelled' || s ==='expired')
  if (cancelled_or_expired)
    badge_color = 'red'
  else if (s === 'on_trial')
    badge_color = 'yellow'

  const renew_prefix = cancelled_or_expired ? 'Expires on' : s === 'on_trial' ? 'Trial ends on' : 'Next billing date'

  const cancelSubscription = async () => {
    setActionLoading(true)
    const func = httpsCallable(functions, 'manageSubscription')
    const resp = await func({subscription:product.subscription, action:'cancel'});
    setActionLoading(false)

  }


  const resumeSubscription = async () => {
    setActionLoading(true)
    const func = httpsCallable(functions, 'manageSubscription')
    const resp = await func({subscription:product.subscription, action:'resume'});
    setActionLoading(false)

  }

  return (
    <Card p={30}>
        <Stack spacing={6}>
          <Grid
          templateRows={['1fr']}
          templateColumns={['1fr', '1fr', '1fr 1fr']}
          gap={4}
          >
            <GridItem>
              <Stack spacing={3}>
                <HStack align="center" spacing={3}>
                  <Heading size="md">{products[product.id].display}</Heading>
                  <Badge colorScheme={badge_color}>{attributes.status_formatted}</Badge>
                </HStack>
              </Stack>
            </GridItem>
            <GridItem>
              <HStack align="center" justifyContent={['start', 'start', 'end']} spacing={3}><Heading size="md">{pricing.price}</Heading><Text>{pricing.suffix}</Text></HStack>
            </GridItem>
          </Grid>
          <VStack spacing={1} align="left">
            <HStack align="center" spacing={3}>
              <Text color="text.subtle">Payment method</Text><Text>{attributes.card_brand} {attributes.card_last_four}</Text>
            </HStack>
            <HStack align="center" spacing={3}><Text color="text.subtle">{renew_prefix}</Text><Text>{new Date(attributes.renews_at).toLocaleDateString()}</Text></HStack>
          </VStack>
          <HStack align="center" spacing={3}>
            {!cancelled_or_expired && 
            <Button colorScheme='red' isLoading={actionLoading} onClick={cancelSubscription}>Cancel</Button>
            }
            {attributes.status === 'cancelled' && 
            <Button colorScheme='primary' isLoading={actionLoading} onClick={resumeSubscription}>Resume</Button>
            }
          </HStack>
        </Stack>
      </Card>
  )
}

function Subscriptions({}) {

  const user = useUser()
  console.log(user.products)
  return (
    <AnnotadedSection title="Subscriptions" description="Information on your active subscription(s)">
      
      {Object.entries(user.products).map(([p, product]) => {
        if (product.recurring) {
          return <SubscriptionCard product={product} key={p}/>
        } else {
          return <></>
        }
      })}

    </AnnotadedSection>
  )
}

export default function PageSettings() {
  const disableEmailPass = auth.currentUser.providerData[0].providerId !== 'password'
  return (
      <PageLayoutContained size="md">
        <VStack spacing={8} align="left">
          <Heading mb={8}>Billing</Heading>
          <Subscriptions/>
          <Divider/>
       
        </VStack>
      </PageLayoutContained>
  );
}
