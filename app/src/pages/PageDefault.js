import {useState, useContext} from 'react';
import {
  Box,
  Text,
  VStack,
  Button,
  Heading,
  Card,
  Stack,
  SimpleGrid,
  SkeletonCircle,
} from '@chakra-ui/react';
import { PageLayoutContained } from '../layouts/DashboardLayout';
import { Link as RouterLink } from 'react-router-dom';
import { useUser } from '../routing/AuthGuard';
import { AccessSkeleton, AccessOverlay } from '../components/AccessGates';
import Iconify from '../components/Iconify';

function AccessCardExmaple({level, display}) {
  return (
    <Card p={30}>
      <Stack w="100%" spacing={3}>
      <AccessSkeleton level={level} as={SkeletonCircle} size='10'>
        <Iconify icon="mdi:magic" size={30}/>
      </AccessSkeleton>
      <AccessSkeleton level={level}>
        <Heading size="md">You've got {display}!</Heading>
      </AccessSkeleton>
      <AccessSkeleton level={level}>
        <Text>Doesn't that feel nice to have access?</Text>
      </AccessSkeleton>
      </Stack>
      <AccessOverlay level={level}>
        <Box textAlign="center" p={3}>
          <VStack spacing={2}>
            <Heading size="sm">Upgrade to {display}</Heading>
            <Button colorScheme="primary" as={RouterLink} to="/app/upgrade">Upgrade</Button>
          </VStack>
        </Box>
      </AccessOverlay>
    </Card>
  )
}

function PageDefault() {
  const [hitdata, setHitdata] = useState(0)
  // const spamServer = async () => {
  //   const sendEmail = httpsCallable(functions, 'sendEmail')
  //   const resp = await sendEmail({template:'welcome'});
  //   // const resp = await helloWorld();
  //   console.log(resp)
  //   // const d = await getDoc(doc(db, "email-templates", "example-1"))
  //   // if (d.exists())
  //   //   console.log(d.data())
  // }

  const user = useUser()

  return (
      <PageLayoutContained size="sm">
        <VStack spacing={5} align="left">
          <Heading>Welcome to Indiestack, {user.profile.first_name}</Heading>
          <Text>Indiestack is your MVP toolkit to get MVPs to market as fast as possible. If you're seeing this, you've probably set it up successfully. Take a look around, keep what you need, kill what you don't and start hacking!
              <br/><br/>
            To showcase the features, we've set up 2 example subscription tiers below. If you followed the tutorial, the following boxes will unlock when you buy the relevant tier. You can also check out the paywall page, which shows a similar setup for guarding an entire page.
          </Text>
          <SimpleGrid columns={2} rows={2} spacing={10} minChildWidth='320px'>
            <AccessCardExmaple level="starter" display="Starter"/>
            <AccessCardExmaple level="elite" display="Elite"/>
          </SimpleGrid>
         
        </VStack>
      </PageLayoutContained>
  );
}

export default PageDefault;
