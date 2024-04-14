import React from 'react';
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
  useColorModeValue,
  Avatar
} from '@chakra-ui/react';
import { LockIcon } from '@chakra-ui/icon'
import Logo from '../components/Logo';
import screenies from '../resources/screenies.png';
import TechnologyLogo from '../components/TechnologyLogo';
import Iconify from '../components/Iconify';
import { signOut, db } from '../firebase';
import {collection, addDoc, Timestamp} from 'firebase/firestore'
import { Link as RouterLink } from 'react-router-dom';


function PageDefault() {
  const spamServer = async () => {
    await addDoc(collection(db, 'tasks'), {
      title: "test",
      description: "desd",
      completed: false,
      created: Timestamp.now()
    })
  }
  return (
    <Box>
      {/* Hero */}
      <Container maxW='700' textAlign='center' pt='75' pb='75'>
        <VStack align='center' spacing={10}>
          <Logo/>
          <Heading size='4xl'>The best bootstrap for <chakra.span color='primary.500'>indie hackers</chakra.span></Heading>
          <Text color="text.subtle" pl='100' pr='100' fontSize='lg' >Small clean code base. Simple stack with old-faithful frameworks react and php. All the things you need to launch and make that money.</Text>
          <HStack>
            <Button size='lg' colorScheme='primary' as={RouterLink} to="/auth/register">Sign up</Button>
            <Button size='lg' colorScheme='gray' as={RouterLink} to="/auth/login">Log in</Button>
          </HStack>
        </VStack>
      </Container>
      {/* Screenshots */}
      <Container maxW={1400}>
        <Image src={screenies}/>
      </Container>
      {/* Technologies */}
      <Container maxW={700} textAlign='center' pt='20' pb='40'>
        <VStack align='center' spacing={20}>
          <VStack spacing={5}>
            <Heading size='lg'>A stack everyone understands</Heading>
            <Text fontSize='lg' color="text.subtle">Built with a “keep it simple stupid” philosophy focused solely on getting v1 into market as quickly as possible.</Text>
          </VStack>
          <VStack spacing={10}>
            <HStack spacing={100}>
              <TechnologyLogo name='react' size={155}/>
              <TechnologyLogo name='chakra' size={155}/>
              <TechnologyLogo name='laravel' size={155}/>
            </HStack>
            <HStack spacing={100}>
              <TechnologyLogo name='jwt' size={155}/>
              <TechnologyLogo name='stripe' size={155}/>
              <TechnologyLogo name='sendgrid' size={155}/>
            </HStack>
          </VStack>
        </VStack>
      </Container>
      {/* Features */}
      <Box backgroundColor="bg.well">
        <Container maxW={900} textAlign='center' pt='100'>
          <VStack align='center' spacing={8}>
            <Heading size='3xl'>Everything you need, without the bells and whistles ⚡️</Heading>
            <Text color="text.subtle" pl='100' pr='100' fontSize='lg' >Opinionated solutions for all the common needs focused on delivering what actually works instead of 100s of complicated options</Text>
          </VStack>
        </Container>
        <Container maxW={1200} pt='100' pb='100'>
          <SimpleGrid columns={3} rows={2} spacing={10}>
            <Card p='30'>
              <VStack align='left' spacing={5}>
                <Circle size='50px' bgColor='primary.600'>
                  <Iconify icon='material-symbols:lock' color='white' size={20}/>
                </Circle>
                <Text fontSize='lg' fontWeight='bold'>Authentication</Text>
                <Text fontSize='lg' color="text.subtle">Simple, standard JWT bearer token authentication with support for email/password as well as google oAuth.</Text>
              </VStack>
            </Card>
            <Card p='30'>
              <VStack align='left' spacing={5}>
                <Circle size='50px' bgColor='primary.600'>
                  <Iconify icon='mdi:users' color='white' size={20}/>
                </Circle>
                <Text fontSize='lg' fontWeight='bold'>Users, Roles and Orgs</Text>
                <Text fontSize='lg' color="text.subtle">User settings management. Optional organizations with user-to-user invite flows and role-level auth.</Text>
              </VStack>
            </Card>
            <Card p='30'>
              <VStack align='left' spacing={5}>
                <Circle size='50px' bgColor='primary.600'>
                  <Iconify icon='mdi:credit-card-outline' color='white' size={20}/>
                </Circle>
                <Text fontSize='lg' fontWeight='bold'>Payments</Text>
                <Text fontSize='lg' color="text.subtle">Process payments with Stripe. Support for one-time purchases, multi-product purchases, and subscription tiers.</Text>
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
                <Text fontSize='lg' fontWeight='bold'>Simple Backend</Text>
                <Text fontSize='lg' color="text.subtle">Laravel skeleton backend set up with API routes, route level auth middleware, and configurable storage defaulted to sqLite.</Text>
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
      {/* Pricing */}
      <Box backgroundColor='primary.mode.400'>
        <Container maxW='700' textAlign='center' pt='100' pb='100'>
          <VStack align='center' spacing={5}>
            <Heading size='3xl' color='white'>Wallet friendly pricing</Heading>
            <Text color='gray.100' size='lg'>Your goal is to make money not spend it. You don’t need all the bells and whistles that make up a $1000 boilerplate anyway. Pay for what you need.</Text>
          </VStack>
        </Container>
        <Container maxW='800' pb='100'>
          <SimpleGrid columns={2} rows={1} spacing={10}>
            <Card p='30'>
              <VStack align='left' spacing={7}>
              <VStack align='left' spacing={3}>
                <Text fontSize='xl' fontWeight='bold'>Single</Text>
                <Text fontSize='4xl' >$99</Text>
                <Text fontSize='lg' >Best for your first launch</Text>
              </VStack>
              <VStack spacing={1} align='left'>
                <HStack>
                  <Iconify icon='material-symbols:check' color='green.400' size={30}/>
                  <Text fontSize='lg' color="text.subtle">Password + Google Auth</Text>
                </HStack>
                <HStack>
                  <Iconify icon='material-symbols:check' color='green.400' size={30}/>
                  <Text fontSize='lg' color="text.subtle">User Roles and Orgs</Text>
                </HStack>
                <HStack>
                  <Iconify icon='material-symbols:check' color='green.400' size={30}/>
                  <Text fontSize='lg' color="text.subtle">Stripe Payments integration</Text>
                </HStack>
                <HStack>
                  <Iconify icon='material-symbols:check' color='green.400' size={30}/>
                  <Text fontSize='lg' color="text.subtle">Chakra UI Integration</Text>
                </HStack>
                <HStack>
                  <Iconify icon='material-symbols:check' color='green.400' size={30}/>
                  <Text fontSize='lg' color="text.subtle">Laravel Backend</Text>
                </HStack>
                <HStack>
                  <Iconify icon='material-symbols:check' color='green.400' size={30}/>
                  <Text fontSize='lg' color="text.subtle">Template Pages</Text>
                </HStack>
                <HStack>
                  <Iconify icon='material-symbols:check' color='green.400' size={30}/>
                  <Text fontSize='lg' color="text.subtle">Sendgrid Email Sending</Text>
                </HStack>
                <HStack>
                  <Iconify icon='material-symbols:check' color='green.400' size={30}/>
                  <Text fontSize='lg' color="text.subtle">React Frontend</Text>
                </HStack>
              </VStack>
              <Button width='100%' colorScheme='primary' as={RouterLink} to="/auth/register">Buy now</Button>
              </VStack>
            </Card>
            <Card p='30'>
              <VStack align='left' spacing={7}>
              <VStack align='left' spacing={3}>
                <Text fontSize='xl' fontWeight='bold'>Unlimited</Text>
                <Text fontSize='4xl' >$299</Text>
                <Text fontSize='lg' >Best for habitual hackers</Text>
              </VStack>
              <VStack spacing={1} align='left'>
                <HStack>
                  <Iconify icon='material-symbols:check' color='green.400' size={30}/>
                  <Text fontSize='lg' color="text.subtle">Password + Google Auth</Text>
                </HStack>
                <HStack>
                  <Iconify icon='material-symbols:check' color='green.400' size={30}/>
                  <Text fontSize='lg' color="text.subtle">User Roles and Orgs</Text>
                </HStack>
                <HStack>
                  <Iconify icon='material-symbols:check' color='green.400' size={30}/>
                  <Text fontSize='lg' color="text.subtle">Stripe Payments integration</Text>
                </HStack>
                <HStack>
                  <Iconify icon='material-symbols:check' color='green.400' size={30}/>
                  <Text fontSize='lg' color="text.subtle">Chakra UI Integration</Text>
                </HStack>
                <HStack>
                  <Iconify icon='material-symbols:check' color='green.400' size={30}/>
                  <Text fontSize='lg' color="text.subtle">Laravel Backend</Text>
                </HStack>
                <HStack>
                  <Iconify icon='material-symbols:check' color='green.400' size={30}/>
                  <Text fontSize='lg' color="text.subtle">Template Pages</Text>
                </HStack>
                <HStack>
                  <Iconify icon='material-symbols:check' color='green.400' size={30}/>
                  <Text fontSize='lg' color="text.subtle">Sendgrid Email Sending</Text>
                </HStack>
                <HStack>
                  <Iconify icon='material-symbols:check' color='green.400' size={30}/>
                  <Text fontSize='lg' color="text.subtle">React Frontend</Text>
                </HStack>
              </VStack>
              <Button width='100%' colorScheme='primary' as={RouterLink} to="/auth/register">Buy now</Button>
              </VStack>
            </Card>
            </SimpleGrid>
        </Container>
      </Box>
      {/* Testimonials */}
      <Container maxW={700} textAlign='center' pt='20' >
      <Heading size='lg'>Loved by hackers like you ❤️</Heading>
      </Container>
      <Container maxW={1200} pt='20' pb='20'>
        <SimpleGrid columns={3} rows={1} spacing={5}>
          <VStack spacing={5} width='100%'>
            <Card p='30' width='100%'>
              <HStack spacing={3} align='top'>
                <Avatar size='sm' name="John Belony" backgroundColor='bg.well'/>
                <VStack spacing={3} align='left' textAlign='left'>
                  <Text fontSize='lg'>John B <chakra.span fontSize='sm' color="text.subtle">May 15, 2023</chakra.span></Text>
                  <Text fontSize='slgm'>Pro-tip: Stop building oAuth flows. Stop fussing with server setups. Please, stop using blade.<br/><br/>Just go buy @indiestack it's literally only $99, I use it on everything I do. It's how I'm able to pop off new MVPs in a weekend.</Text>
                </VStack>
              </HStack>
            </Card>
          
            <Card p='30' width='100%'>
              <HStack spacing={3} align='top'>
                <Avatar size='sm' name="Sengal Fredriks" backgroundColor='bg.well'/>
                <VStack spacing={3} align='left' textAlign='left'>
                  <Text fontSize='lg'>Sengal F <chakra.span fontSize='sm' color="text.subtle">April 29, 2023</chakra.span></Text>
                  <Text fontSize='slgm'>This a numbers game. 95% of the projects I've shipped made $0. You gotta have a good workflow and ship fast and often. Grab a boilerplate project. If you don't have one @indiestack is the go-to. Speed up your time to market by 100x - rinse, repeat. 🔥</Text>
                </VStack>
              </HStack>
            </Card>
          </VStack>
          <VStack spacing={5} width='100%'>
            
            <Card p='30' width='100%'>
              <HStack spacing={3} align='top'>
                <Avatar size='sm' name="Fredrik Ansel" backgroundColor='bg.well'/>
                <VStack spacing={3} align='left' textAlign='left'>
                  <Text fontSize='lg'>Fredrik A <chakra.span fontSize='sm' color="text.subtle">May 27, 2023</chakra.span></Text>
                  <Text fontSize='slgm'>Oh my god I just tried @indiestack and I'm speachless 🥲<br/><br/>Why did I spend the last 5 years rebuilding auth and payment flows...</Text>
                </VStack>
              </HStack>
            </Card>
            <Card p='30' width='100%'>
              <HStack spacing={3} align='top'>
                <Avatar size='sm' name="John Belony" backgroundColor='bg.well'/>
                <VStack spacing={3} align='left' textAlign='left'>
                  <Text fontSize='lg'>John B <chakra.span fontSize='sm' color="text.subtle">May 15, 2023</chakra.span></Text>
                  <Text fontSize='slgm'>robust synopsis for high level overviews. Organically grow the holistic world<br></br><br></br>Leverage agile frameworks to provide a robust synopsis for high level overviews. Organically grow the holistic world view of disruptive innovation via workplace diversity and empowerment.</Text>
                </VStack>
              </HStack>
            </Card>
          
          </VStack>
          <VStack spacing={5} width='100%'>
            <Card p='30' width='100%'>
              <HStack spacing={3} align='top'>
                <Avatar size='sm' name="John Belony" backgroundColor='bg.well'/>
                <VStack spacing={3} align='left' textAlign='left'>
                  <Text fontSize='lg'>John B <chakra.span fontSize='sm' color="text.subtle">May 15, 2023</chakra.span></Text>
                  <Text fontSize='slgm'>Leverage agile frameworks to provide a robust synopsis for high level overviews. Organically grow the holistic world view of disruptive innovation via workplace diversity and empowerment.</Text>
                </VStack>
              </HStack>
            </Card>
            <Card p='30' width='100%'>
              <HStack spacing={3} align='top'>
                <Avatar size='sm' name="John Belony" backgroundColor='bg.well'/>
                <VStack spacing={3} align='left' textAlign='left'>
                  <Text fontSize='lg'>John B <chakra.span fontSize='sm' color="text.subtle">May 15, 2023</chakra.span></Text>
                  <Text fontSize='slgm'>Organically grow the holistic world view of disruptive innovation via workplace diversity and empowerment.</Text>
                </VStack>
              </HStack>
            </Card>
            
          </VStack>
        </SimpleGrid>
      </Container>
      {/* Footer */}
      <Container maxW='300' pb='20'>
        <Text color="text.subtle">Hacked together with ⚡️ in NYC</Text>
      </Container>
    </Box>
  );
}

export default PageDefault;
