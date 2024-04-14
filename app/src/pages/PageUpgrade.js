import {
  Text,
  VStack,
  Heading,
  Container,
  SimpleGrid,
  Card,
  HStack
} from '@chakra-ui/react';
import { PageLayoutContained } from '../layouts/DashboardLayout';
import Iconify from '../components/Iconify';
import { products } from '../config';
import BuyButton from '../components/BuyButton'; 

function FeaturePoint({children}) {
  return (
    <HStack>
      <Iconify icon='material-symbols:check' color='green.400' size={20}/>
      <Text fontSize='md' color="text.subtle">{children}</Text>
    </HStack>
  )
}

function PageUpgrade() {
  
  const product_a = Object.keys(products)[0]
  const product_b = Object.keys(products)[1]

  return (
      <PageLayoutContained size="sm">
        <Container maxW='700' textAlign='center' pb="50">
          <VStack align='center' spacing={5}>
            <Heading size='3xl' >Upgrade to get access</Heading>
            <Text color='text.subtle' size='lg'>This is a demo! You can test out the purchase flow without actually paying! When you click buy below, use card number '4242 4242 4242 4242' any future date for expiration, and any values you want for anything else.</Text>
          </VStack>
        </Container>
        <Container maxW='800' pb='100'>
          <SimpleGrid columns={2} rows={1} spacing={10}>
            <Card p='30'>
              <VStack align='left' spacing={7}>
              <VStack align='left' spacing={2}>
                <Text fontSize='lg' fontWeight='bold'>{products[product_a].display}</Text>
                <Text fontSize='3xl' >$99</Text>
                <Text fontSize='md' >Best for your first launch</Text>
              </VStack>
              <VStack spacing={1} align='left'>
                <FeaturePoint>Password + Google Auth</FeaturePoint>
                <FeaturePoint>User Roles and Orgs</FeaturePoint>
                <FeaturePoint>Stripe Payments integration</FeaturePoint>
                <FeaturePoint>Chakra UI Integration</FeaturePoint>
                <FeaturePoint>Laravel Backend</FeaturePoint>
                <FeaturePoint>Template Pages</FeaturePoint>
                <FeaturePoint>Sendgrid Email Sending</FeaturePoint>
                <FeaturePoint>React Frontend</FeaturePoint>
              </VStack>
              <BuyButton product_id={product_a}  width='100%' colorScheme='primary'>Buy now</BuyButton>
              </VStack>
            </Card>
            <Card p='30'>
              <VStack align='left' spacing={7}>
              <VStack align='left' spacing={2}>
                <Text fontSize='lg' fontWeight='bold'>{products[product_b].display}</Text>
                <Text fontSize='3xl' >$299</Text>
                <Text fontSize='md' >Best for habitual hackers</Text>
              </VStack>
              <VStack spacing={1} align='left'>
              <FeaturePoint>Password + Google Auth</FeaturePoint>
                <FeaturePoint>User Roles and Orgs</FeaturePoint>
                <FeaturePoint>Stripe Payments integration</FeaturePoint>
                <FeaturePoint>Chakra UI Integration</FeaturePoint>
                <FeaturePoint>Laravel Backend</FeaturePoint>
                <FeaturePoint>Template Pages</FeaturePoint>
                <FeaturePoint>Sendgrid Email Sending</FeaturePoint>
                <FeaturePoint>React Frontend</FeaturePoint>
              </VStack>
              <BuyButton product_id={product_b} overlay={true} width='100%' colorScheme='primary'>Buy now</BuyButton>
              </VStack>
            </Card>
            </SimpleGrid>
        </Container>
      </PageLayoutContained>
  );
}

export default PageUpgrade;
