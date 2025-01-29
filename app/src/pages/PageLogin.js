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
import { signInWithEmailAndPassword, signInOrCreateUserWithGoogle, auth, db } from '../firebase';
import { setDoc, doc, updateDoc, getDoc } from 'firebase/firestore';

function AltLoginDivider() {
  return (
    <Box position='relative' width="100%" pt="5" pb="5">
      <Divider />
      <AbsoluteCenter bg='chakra-body-bg' px='4'>
        Or
      </AbsoluteCenter>
    </Box>
  );
}

function PageDefault() {
  const [loading, setLoading] = useState(false)
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState({show:false,severity:'info',display:''})

    const passwordLogin = async () => {
      setLoading(true)
      setError({show:false,severity:'error',display:''});
      signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Signed in
            const user = userCredential.user;
            console.log(user);
            setLoading(false)
        })
        .catch((error) => {
            const errorCode = error.code;
            const errorMessage = error.message;
            console.log(errorCode, errorMessage)
            let message = "Something went wrong, try again";
            switch (errorCode) {
              case 'auth/invalid-email':
                message = "Invalid email address";break;
              case 'auth/user-not-found':
                message = "Email or password is incorrect";break;
              case 'auth/wrong-password':
                message = "Email or password is incorrect";break;
            }
            setError({show:true,severity:'error',display:message})
            setLoading(false)
        });
        
    };
    
  return (
    <Box minH="calc(100vh - 60px)" textAlign="center" position='relative'>
      <AbsoluteCenter w="100%"><Box w="100%">
            
        <Container maxW='400' >
          <VStack spacing={8} w="100%">

            <VStack spacing={4} w="100%" align="left" textAlign="left">
              <Logo size={12} />
              <Heading size="md" >Login to Indiestack</Heading>
              <Text color='text.subtle'>Login to your account</Text>
            </VStack>
            
            <VStack spacing={4} w="100%" >
              <Input w="100%" placeholder='Email' type='email' value={email} onChange={(e)=>setEmail(e.target.value)} />
              <Input w="100%" placeholder='Password' type='password' value={password} onChange={(e)=>setPassword(e.target.value)} />
              <Button colorScheme="primary" w="100%" onClick={passwordLogin} isLoading={loading}>Login</Button>
              {error.show &&
                <Alert status={error.severity}>
                  <AlertIcon />
                  {error.display}
                </Alert>
                }
              {error.show && 
                <Text textAlign="left" w="100%"  color='text.subtle'>Forgot password? <Link as={RouterLink} to="/auth/recover" color="primary.500">Click here</Link></Text>
              }
              <Text textAlign="left" w="100%"  color='text.subtle'>Don't have an account? <Link as={RouterLink} to="/auth/register" color="primary.500">Sign up</Link></Text>
              <AltLoginDivider/>
              <Button 
              w="100%"
              colorScheme='gray' variant="outline" 
              leftIcon={<Iconify icon="flat-color-icons:google"/>}
              onClick={signInOrCreateUserWithGoogle}
              >Login with Google</Button>
            </VStack>

          </VStack>
        </Container>
            
      </Box></AbsoluteCenter>
    </Box>
    
  );
}

export default PageDefault;
