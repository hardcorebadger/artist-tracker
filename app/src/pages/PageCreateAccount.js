import {useState} from 'react';
import {
  Box,
  Text,
  Link,
  VStack,
  Code,
  AbsoluteCenter,
  Container,AlertIcon,
  Heading, FormControl, Divider, Input, FormLabel, FormHelperText, FormErrorMessage, Button, Alert, HStack
} from '@chakra-ui/react';
import Logo  from '../components/Logo';
import {Link as RouterLink} from 'react-router-dom'
import Iconify from '../components/Iconify';
import { createUserWithEmailAndPassword, signInOrCreateUserWithGoogle, auth, db} from '../firebase';
import { updateProfile } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';

function AltLoginDivider() {
  return (
    <Box position='relative' width="100%" pt="5" pb="5">
      <Divider />
      <AbsoluteCenter bg='bg.default' px='4'>
        Or
      </AbsoluteCenter>
    </Box>
  );
}

function PageDefault() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cpassword, setCpassword] = useState("");

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");

  const [error, setError] = useState({show:false,severity:'info',display:''})

  const registerSubmit = async () => {
    if (cpassword !== password) {
      setError({show:true,severity:'error',display:"Passwords do not match"});
      return;
    }
    setLoading(true)
    await createUserWithEmailAndPassword(email, password, first, last)
      .catch((error) => {
          const errorCode = error.code;
          const errorMessage = error.message;
          console.log(error);
          let message = "Something went wrong, try again";
          switch (errorCode) {
            case 'auth/invalid-email':
              message = "Invalid email address";break;
            case 'auth/missing-password':
              message = "Invalid password";break;
            case 'auth/weak-password':
              message = "Password must be at least 6 characters"; break;
            case 'auth/email-already-in-use':
              message = "Email already in use";break;
            default:break;

          }
          setError({show:true,severity:'error',display:message})
          setLoading(false)
      })
      setLoading(false)
  }

  return (
    <Box minH="calc(100vh - 60px)" textAlign="center" position='relative'>
      <AbsoluteCenter w="100%"><Box w="100%">
            
        <Container maxW='400' >
          <VStack spacing={8} w="100%">
            <VStack spacing={4} w="100%" align="left" textAlign="left">
              <Logo size={12} />
              <Heading size="md" >Create an account</Heading>
              <Text color='text.subtle'>To get started, create an account</Text>
            </VStack>
            
            <VStack spacing={4} w="100%" >
             <HStack soacing={4} w="100%">
             <Input w="100%" placeholder='First' type='first' value={first} onChange={(e)=>setFirst(e.target.value)} />
             <Input w="100%" placeholder='Last' type='last' value={last} onChange={(e)=>setLast(e.target.value)} />

             </HStack>
              <Input w="100%" placeholder='Email' type='email' value={email} onChange={(e)=>setEmail(e.target.value)} />
              <Input w="100%" placeholder='Password' type='password' value={password} onChange={(e)=>setPassword(e.target.value)} />
              <Input w="100%" placeholder='Confirm Password' type='password' value={cpassword} onChange={(e)=>setCpassword(e.target.value)} />
            <Button colorScheme="primary" w="100%" onClick={registerSubmit} isLoading={loading}>Sign up</Button>
            {error.show &&
              <Alert status={error.severity}>
                <AlertIcon />
                {error.display}
              </Alert>
              }
            <Text textAlign="left" w="100%"  color='text.subtle'>Already have an account? <Link as={RouterLink} to="/auth/login" color="primary.500">Login</Link></Text>
            <AltLoginDivider/>
            <Button 
              w="100%"
              colorScheme='gray' variant="outline" 
              leftIcon={<Iconify icon="flat-color-icons:google"/>}
              onClick={signInOrCreateUserWithGoogle}
              >Sign up with Google</Button>
            </VStack>
          </VStack>
        </Container>
            
      </Box></AbsoluteCenter>
    </Box>
    
  );
}

export default PageDefault;
