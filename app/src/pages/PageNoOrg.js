import {useState} from 'react';
import {
  Box,
  Text,
  Link,
  VStack,
  Code,
  AbsoluteCenter,
  Container, useColorModeValue,AlertIcon,
  Heading, FormControl, Divider, Input, FormLabel, FormHelperText, FormErrorMessage, Button, Alert
} from '@chakra-ui/react';
import Logo  from '../components/Logo';
import {Link as RouterLink} from 'react-router-dom'
import Iconify from '../components/Iconify';
import { signInWithEmailAndPassword, signInOrCreateUserWithGoogle, auth, db, signOut } from '../firebase';
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useUser } from '../routing/AuthGuard';

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
    const user = useUser()
    const [loading, setLoading] = useState(false)
    const [orgID, setOrgID] = useState("");
    const [error, setError] = useState({show:false,severity:'info',display:''})

    const sumbitOrgID = async () => {
      const docSnap = await getDoc(doc(db, "organizations", orgID));
      if (docSnap.exists()) {
        console.log("doc exists")
        console.log(user)
        await updateDoc(doc(db, "users", user.auth.uid), {
          organization: orgID,
          organizations: [orgID]
        });
        window.location.reload()
      } else {
        console.log("No such document!");
        setError({show:true,severity:'error',display:'Organization not found'})
      }
    }

    // const passwordLogin = async () => {
    //   setLoading(true)
    //   setError({show:false,severity:'error',display:''});
    //   signInWithEmailAndPassword(email, password)
    //     .then((userCredential) => {
    //         // Signed in
    //         const user = userCredential.user;
    //         console.log(user);
    //         setLoading(false)
    //     })
    //     .catch((error) => {
    //         const errorCode = error.code;
    //         const errorMessage = error.message;
    //         console.log(errorCode, errorMessage)
    //         let message = "Something went wrong, try again";
    //         switch (errorCode) {
    //           case 'auth/invalid-email':
    //             message = "Invalid email address";break;
    //           case 'auth/user-not-found':
    //             message = "Email or password is incorrect";break;
    //           case 'auth/wrong-password':
    //             message = "Email or password is incorrect";break;
    //         }
    //         setError({show:true,severity:'error',display:message})
    //         setLoading(false)
    //     });
        
    // };
    
  return (
    <Box minH="calc(100vh - 60px)" textAlign="center" position='relative'>
      <AbsoluteCenter w="100%"><Box w="100%">
            
        <Container maxW='400' >
          <VStack spacing={8} w="100%">

            <VStack spacing={4} w="100%" align="left" textAlign="left">
              <Logo size={12} />
              <Heading size="md" >Join your team</Heading>
              <Text color='text.subtle'>To join your team, enter your organization ID below.</Text>
            </VStack>
            
            <VStack spacing={4} w="100%" >
              <Input w="100%" placeholder='myOrgID' value={orgID} onChange={(e)=>setOrgID(e.target.value)} />
              <Button colorScheme="primary" w="100%" onClick={sumbitOrgID} isLoading={loading}>Join</Button>
              {error.show &&
                <Alert status={error.severity}>
                  <AlertIcon />
                  {error.display}
                </Alert>
                }
              {/* {error.show && 
                <Text textAlign="left" w="100%"  color='text.subtle'>Forgot password? <Link as={RouterLink} to="/auth/recover" color="primary.500">Click here</Link></Text>
              } */}
          
            </VStack>

          </VStack>
        </Container>
            
      </Box></AbsoluteCenter>
    </Box>
    
  );
}

export default PageDefault;
