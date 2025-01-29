import {useState} from 'react';
import {
  Box,
  Text,
  Link,
  VStack,
  Code,
  AbsoluteCenter,
  Container,AlertIcon,
  Heading, FormControl, Divider, Input, FormLabel, FormHelperText, FormErrorMessage, Button, Alert
} from '@chakra-ui/react';
import Logo  from '../components/Logo';
import {Link as RouterLink} from 'react-router-dom'
import Iconify from '../components/Iconify';
import { auth } from '../firebase';
import { setDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';


export default function PageResetPassword() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("");

  const sendResetEmail = async () => {
    setLoading(true)
    await sendPasswordResetEmail(auth, email)
    setLoading(false)
  };
    
  return (
    <Box minH="calc(100vh - 60px)" textAlign="center" position='relative'>
      <AbsoluteCenter w="100%"><Box w="100%">
            
        <Container maxW='400' >
          <VStack spacing={8} w="100%">

            <VStack spacing={4} w="100%" align="left" textAlign="left">
              <Logo size={12} />
              <Heading size="md" >Reset your password</Heading>
              <Text color='text.subtle'>Enter your email and we'll send a link to change your password</Text>
            </VStack>
            
            <VStack spacing={4} w="100%" >
              <Input w="100%" placeholder='Email' type='email' value={email} onChange={(e)=>setEmail(e.target.value)} />
              <Button colorScheme="primary" w="100%" onClick={sendResetEmail} isLoading={loading}>Send Recovery Link</Button>
              <Text textAlign="left" w="100%"  color='text.subtle'>Remember your password? <Link as={RouterLink} to="/auth/login" color="primary.500">Login</Link></Text>
            </VStack>

          </VStack>
        </Container>
            
      </Box></AbsoluteCenter>
    </Box>
    
  );
}

