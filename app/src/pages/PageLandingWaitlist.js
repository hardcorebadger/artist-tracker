import {useState} from 'react';
import {
  Text,
  Heading,
  Container,
  VStack,
  chakra,
  HStack,
  Button,
  Box,
  Image,
  SimpleGrid,
  Card,
  Circle,
  Input,
  Avatar,
  Link
} from '@chakra-ui/react';
import { LockIcon } from '@chakra-ui/icon'
import Logo from '../components/Logo';
import screenies from '../resources/screenies.png';
import TechnologyLogo from '../components/TechnologyLogo';
import Iconify from '../components/Iconify';
import { signOut, db } from '../firebase';
import {doc, setDoc, Timestamp} from 'firebase/firestore'
function PageDefault() {
  const [email, setEmail] = useState("")
  const [optInState, setOptInState] = useState(0)
  const emailOptIn = async () => {
    setOptInState(1)
    await setDoc(doc(db, 'optins', email), {
      email: email,
      subscribed: Timestamp.now()
    })
    setOptInState(2)
  }
  return (
    <Box>
      {/* Hero */}
      <Container maxW='700' textAlign='center' pt='55' pb='55'>
        <VStack align='center' spacing={10}>
          <Logo/>
          <Heading size='4xl'>The MVP toolkit for <chakra.span color='primary.500'>indie hackers</chakra.span></Heading>
          <Container maxW="500" >
          <VStack align='center' spacing={10}>
          <Text color="text.subtle"  fontSize='lg' >Ship better MVPs 10x faster. Deploy a ready to launch app with Auth, Payments, Landing page and more in under 10 minutes. No fluff, just speed.</Text>
          <VStack align='center' spacing={5}>
          <HStack w="100%">
            <Input size='lg' placeholder='Your email' type='email' value={email} onChange={(e)=>setEmail(e.target.value)}/>
            <Button pl='10' pr='10' size='lg' colorScheme='primary' 
            onClick={emailOptIn} isLoading={optInState===1} loadingText="Get notified"
            leftIcon={optInState < 2 ? null : <Iconify icon='material-symbols:check'/>}
            >{optInState < 2 ? "Get notified" : "Thanks!"}</Button>
          </HStack>
          <Text color="text.subtle"  fontSize='sm' >Work in progress 🚧 Follow the journey <Link color='primary.500' href="https://twitter.com/jaketref">@jaketref</Link></Text>

          </VStack>
          </VStack>
          </Container>
        </VStack>
      </Container>
      {/* Screenshots */}
      <Container maxW={1400}>
        <Image src={screenies}/>
      </Container>
      {/* Technologies */}
      <Container maxW={700} textAlign='center' pt='20' pb='75'>
        <VStack align='center' spacing={20} w="100%">
          <VStack spacing={5}>
            <Heading size='lg'>A stack everyone understands</Heading>
            <Text fontSize='lg' color="text.subtle">Built with a “keep it simple stupid” philosophy focused solely on getting v1 into market as quickly as possible.</Text>
          </VStack>
          <SimpleGrid w="100%" templateColumns={['repeat(2, 1fr)', 'repeat(3, 1fr)']} templateRows={['repeat(3, 1fr)', 'repeat(2, 1fr)']} gap={10}>
              <TechnologyLogo name='react' size={155}/>
              <TechnologyLogo name='chakra' size={155}/>
              <TechnologyLogo name='firebase' size={155}/>
              <TechnologyLogo name='jwt' size={155}/>
              <TechnologyLogo name='lemonsqueezy' size={155}/>
              <TechnologyLogo name='sendgrid' size={155}/>
          </SimpleGrid>
        </VStack>
      </Container>
      {/* Features */}
      <Box backgroundColor="bg.well">
        <Container maxW={900} textAlign='center' pt='100'>
          <VStack align='center' spacing={8}>
            <Heading size='3xl'>Everything you need, without the bells and whistles ⚡️</Heading>
            <Container maxW="500" ><Text color="text.subtle" fontSize='lg' >Opinionated solutions for all the common needs focused on delivering what actually works instead of 100s of complicated options</Text></Container>
          </VStack>
        </Container>
        <Container maxW={1200} pt='100' pb='100'>
          <SimpleGrid columns={3} rows={2} spacing={10} minChildWidth='320px'>
            <Card p='30'>
              <VStack align='left' spacing={5}>
                <Circle size='50px' bgColor='primary.600'>
                  <Iconify icon='material-symbols:lock' color='white' size={20}/>
                </Circle>
                <Text fontSize='lg' fontWeight='bold'>Authentication</Text>
                <Text fontSize='lg' color="text.subtle">Onboard users quickly. Firebase authentication with support for email/password as well as google, github etc.</Text>
              </VStack>
            </Card>
            <Card p='30'>
              <VStack align='left' spacing={5}>
                <Circle size='50px' bgColor='primary.600'>
                  <Iconify icon='mdi:users' color='white' size={20}/>
                </Circle>
                <Text fontSize='lg' fontWeight='bold'>User management</Text>
                <Text fontSize='lg' color="text.subtle">Avoid spending time on settings pages with out of the box user profiles. Change/forgot password, update email, details, and more.</Text>
              </VStack>
            </Card>
            <Card p='30'>
              <VStack align='left' spacing={5}>
                <Circle size='50px' bgColor='primary.600'>
                  <Iconify icon='mdi:credit-card-outline' color='white' size={20}/>
                </Circle>
                <Text fontSize='lg' fontWeight='bold'>Payments</Text>
                <Text fontSize='lg' color="text.subtle">Process one time or tiered subscription payments with Lemonsqueezy. High converting checkout + apple pay and taxes.</Text>
              </VStack>
            </Card>
            <Card p='30'>
              <VStack align='left' spacing={5}>
                <Circle size='50px' bgColor='primary.600'>
                  <Iconify icon='mdi:art' color='white' size={20}/>
                </Circle>
                <Text fontSize='lg' fontWeight='bold'>Design System</Text>
                <Text fontSize='lg' color="text.subtle">Build on the Chakra UI framework selected for its opinionated, no-fuss, ready-to-ship mentality. Free design system for figma.</Text>
              </VStack>
            </Card>
            <Card p='30'>
              <VStack align='left' spacing={5}>
                <Circle size='50px' bgColor='primary.600'>
                  <Iconify icon='material-symbols:code' color='white' size={20}/>
                </Circle>
                <Text fontSize='lg' fontWeight='bold'>Serverless backend</Text>
                <Text fontSize='lg' color="text.subtle">Spend less time on DB schemas, SSL and server configuration with a Firebase serverless backend. Deploy fullstack in 1 proejct.</Text>
              </VStack>
            </Card>
            <Card p='30'>
              <VStack align='left' spacing={5}>
                <Circle size='50px' bgColor='primary.600'>
                  <Iconify icon='mdi:magic' color='white' size={20}/>
                </Circle>
                <Text fontSize='lg' fontWeight='bold'>Template Pages</Text>
                <Text fontSize='lg' color="text.subtle">Out of the box pages without the clutter. Stuff you always need and don’t need to re-invent. Landing page, settings, pricing tiers etc.</Text>
              </VStack>
            </Card>
          </SimpleGrid>
        </Container>
      </Box>
     {/* CTA */}
     <Container maxW='700' textAlign='center' pt='100' pb='100'>
        <VStack align='center' spacing={10}>
          <Heading size='3xl'>Follow the journey 🚧</Heading>
          <Container maxW="500" >
          <VStack align='center' spacing={10}>
          <Text color="text.subtle"  fontSize='lg' >Indiestack is currently a work in progress. Enter your info to get notified when we launch</Text>
          <VStack align='center' spacing={5}>
          <HStack w="100%">
          <Input size='lg' placeholder='Your email' type='email' value={email} onChange={(e)=>setEmail(e.target.value)}/>
            <Button pl='10' pr='10' size='lg' colorScheme='primary' 
            onClick={emailOptIn} isLoading={optInState===1} loadingText="Get notified"
            leftIcon={optInState < 2 ? null : <Iconify icon='material-symbols:check'/>}
            >{optInState < 2 ? "Get notified" : "Thanks!"}</Button>
          </HStack>
          <Text color="text.subtle"  fontSize='sm' >Or follow along <Link color='primary.500' href="https://twitter.com/jaketref">@jaketref</Link></Text>

          </VStack>
          </VStack>
          </Container>
        </VStack>
      </Container>
    </Box>
  );
}

export default PageDefault;
