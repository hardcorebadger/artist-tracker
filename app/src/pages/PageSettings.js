import {useEffect, useRef, useState} from 'react';
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
  Badge, useToast,
} from '@chakra-ui/react';
import { PageLayoutContained } from '../layouts/DashboardLayout';
import { updateEmail, updatePassword } from "firebase/auth";
import {signInWithEmailAndPassword, signInWithGoogle, auth, db, useAuth, functions} from '../firebase';
import { useUser } from '../routing/AuthGuard';
import { updateDoc, doc, startAfter } from 'firebase/firestore';
import { products } from '../config';
import { Link as RouterLink } from 'react-router-dom';
import AnnotadedSection from '../components/AnnotatedSection';
import {signInWithPhoneNumber, updatePhoneNumber} from "@firebase/auth";
import { getAuth, RecaptchaVerifier, PhoneAuthProvider } from "firebase/auth";
import {PhoneNumberInput} from "../components/PhoneNumberInput";
import {httpsCallable} from "firebase/functions";
import {goFetch} from "../App";
function ChangeNameSection({disabled}) {
  const user = useUser()

  const [first, setFirst] = useState(user.profile.first_name)
  const [last, setLast] = useState(user.profile.last_name)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const canSave = (first !== user.profile.first_name || last !== user.profile.last_name)

  const reset = () => {
    setFirst(user.profile.first_name)
    setLast(user.profile.last_name)
    setError(null)
  }

  const saveName = async () => {
    setLoading(true)
    const d = doc(db, 'users', user.auth.uid)
    await updateDoc(d, {
      first_name: first,
      last_name: last
    }).catch((error) => {
      setError("Something went wrong, try again")
      setLoading(false)
    })
    setLoading(false)
  }

  return (
    <AnnotadedSection
    title="Update name"
    description={
      disabled ? "Your login method does not support changing name" :
      "Update your first and last name"
    }
    >
      <VStack spacing={2} align="left">
        <HStack spacing={2} align="center">
        <Input disabled={disabled} w="100%" placeholder='First' value={first} onChange={(e)=>setFirst(e.target.value)} />
        <Input disabled={disabled} w="100%" placeholder='Last' value={last} onChange={(e)=>setLast(e.target.value)} />
        </HStack>
        {error &&
          <Alert status='error'>
            <AlertIcon />
            {error}
          </Alert>
        }
        { canSave &&
        <HStack justify="right">
          <Button colorScheme='primary' isLoading={loading} onClick={saveName}>Save</Button>
          <Button colorScheme='gray' onClick={reset}>Reset</Button>
        </HStack>
        }
      </VStack>
    </AnnotadedSection>
  )
}

function ChangePhoneSection({disabled}) {
  const [verify, setVerify] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()
  const auth = getAuth()
  const user = useUser()
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 59 * 1000); // 10 minutes = 10 * 60 seconds * 1000 milliseconds
  const [verifyId, setVerifyId] = useState(((user.profile?.sms?.verified === false && user.profile?.sms.code_sent_at > tenMinutesAgo.getTime()) ? (user?.profile?.sms?.verify_id ?? null) : ""))

  const [curPhone, setCurPhone] = useState( user.profile?.sms?.number ?? "")
  const canSave = true
      // curPhone !== "" && (curPhone !== user.profile?.sms?.number && "+"+curPhone !== user.profile?.sms?.number)

  const reset = () => {
    setCurPhone("")
    // setPhone("")
    setVerifyId(null)
    setVerify("")
    setLoading(false)
    setError(null)

  }


  const verifyPhone = async () => {
    setLoading(true)
    if(user.profile && (user.profile?.sms?.number + '1' !== curPhone) && (user.profile?.sms?.number + 1 !== '+'+curPhone)) {
      try {
        const sendCode = (data) => {
          return goFetch(user, 'POST', 'sms', data)
        }
        const resp = await sendCode({number: '+'+curPhone})
        if (resp?.id) {
          setVerifyId(resp.id)
        }
        setLoading(false)
      } catch(e) {
        setLoading(false)
        console.error(e);
        toast({
          title: 'Phone validation failed.',
          description: "We were unable to verify your phone number, please confirm the information or try again.",
          status: 'error',
          duration: 9000,
          isClosable: true,
        })
      }
    }

  }
  const savePhone = async () => {
    setLoading(true)
    try {
      const verifyCode = (data) => {
        return goFetch(user, 'POST', 'sms', data)
      }
      const resp = await verifyCode({number: '+'+curPhone, code: verify})
      console.log(resp)

      toast({
        title: 'Phone number updated',
        description: "Your phone number has been successfully updated.",
        status: 'success',
        duration: 9000,
        isClosable: true,
      })
      setLoading(false)
      setVerifyId(null)

    } catch (e) {
      setLoading(false)
      console.error(e);

      toast({
        title: 'Failed to validate code',
        description: "We were unable to verify your one time code, please confirm the information or try again.",
        status: 'error',
        duration: 9000,
        isClosable: true,
      })
    }
  }
  useEffect(() => {

  }, [verifyId]);
  return (
      <AnnotadedSection
          title="Update phone"
          description={
            disabled ? "Your login method does not support changing email" :
                "Enter your phone number to receive a verification code. Text HELP for how to use the mobile features."
          }
      >
        <VStack spacing={2} align="left">
          <HStack spacing={2} align="center">
            <PhoneNumberInput disabled={disabled} placeholder='Phone' value={curPhone} onChange={(e) => {
              setCurPhone(e)
            }}/>
          </HStack>
          <Text color={'text.subtle'} fontSize={'10px'}>This phone number will be used for 2FA purposes, and to reply to texts we receive asking for information or requesting imports.</Text>
          {verifyId ? (
              <Input disabled={disabled} w="100%" placeholder='Code' autoComplete={'one-time-code'} value={verify}
                     onChange={(e) => setVerify(e.target.value)}/>) : null}
          {error &&
              <Alert status='error'>
                <AlertIcon/>
                {error}
              </Alert>
          }
          {(canSave || verifyId) &&
              <HStack justify="right">
                <Button colorScheme='primary' isLoading={loading} onClick={() => {
                  if (verifyId) {
                    savePhone();
                  } else {
                    verifyPhone()
                  }
                }}>{verifyId ? "Verify" : "Save"}</Button>
                <Button colorScheme='gray' disabled={loading} onClick={reset}>Reset</Button>
              </HStack>
          }

        </VStack>
      </AnnotadedSection>
  )
}

function ChangeEmailSection({disabled}) {
  const [curEmail, setCurEmail] = useState("")
  const [pass, setPass] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const canSave = newEmail !== ""

  const reset = () => {
    setCurEmail("")
    setPass("")
    setNewEmail("")
    setError(null)
  }

  const saveEmail = () => {
    setLoading(true)
    signInWithEmailAndPassword(curEmail, pass).then(() => {
      updateEmail(auth.currentUser, newEmail).then(() => {
        // Email updated!
        console.log("success")
        setLoading(false)
        reset()
        // ...
      }).catch((error) => {
        // An error occurred
        const errorCode = error.code;
        let message = "Something went wrong, try again"
        switch (errorCode) {
          case 'auth/invalid-email':
            message = "New email address not valid";break;
          case 'auth/email-already-in-use':
            message = "New email already in use";break;
        }
        setError(message)
        setLoading(false)
        // ...
      });
    }).catch((error) => {
      // An error occurred
      const errorCode = error.code;
      let message = "Something went wrong, try again"
      switch (errorCode) {
        case 'auth/invalid-email':
          message = "Invalid email address";break;
        case 'auth/user-not-found':
          message = "Email or password is incorrect";break;
        case 'auth/wrong-password':
          message = "Email or password is incorrect";break;
      }
      setError(message)
      setLoading(false)
      // ...
    })
    
  }
  return (
    <AnnotadedSection
    title="Update email"
    description={
      disabled ? "Your login method does not support changing email" :
      "Enter your current login information to update your email address"
    }
    >
      <VStack spacing={2} align="left">
        <HStack spacing={2} align="center">
        <Input disabled={disabled} w="100%" placeholder='Email' type='email' value={curEmail} onChange={(e)=>setCurEmail(e.target.value)} />
        <Input disabled={disabled} w="100%" placeholder='Password' type='password' value={pass} onChange={(e)=>setPass(e.target.value)} />
        </HStack>
        <Input disabled={disabled} w="100%" placeholder='New Email' type='email' value={newEmail} onChange={(e)=>setNewEmail(e.target.value)} />
        {error &&
          <Alert status='error'>
            <AlertIcon />
            {error}
          </Alert>
        }
        { canSave &&
        <HStack justify="right">
          <Button colorScheme='primary' isLoading={loading} onClick={saveEmail}>Save</Button>
          <Button colorScheme='gray' onClick={reset}>Reset</Button>
        </HStack>
        }
      </VStack>
    </AnnotadedSection>
  )
}

function ChangePasswordSection({disabled}) {
  const [curEmail, setCurEmail] = useState("")
  const [pass, setPass] = useState("")
  const [newPass, setNewPass] = useState("")
  const [newPassConf, setNewPassConf] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const canSave = newPass !== ""

  const reset = () => {
    setCurEmail("")
    setPass("")
    setNewPass("")
    setNewPassConf("")
    setError(null)
  }

  const savePass = () => {
    if (newPass !== newPassConf) {
      console.log("validation error")
      setError("Passwords do not match")
      return
    }
    setLoading(true)
    signInWithEmailAndPassword(curEmail, pass).then(() => {
      updatePassword(auth.currentUser, newPass).then(() => {
        // Email updated!
        console.log("success")
        setLoading(false)
        reset()
        // ...
      }).catch((error) => {
        // An error occurred
        const errorCode = error.code;
        console.log(error) 
        let message = "Something went wrong, try again"
        switch (errorCode) {
          case 'auth/weak-password':
            message = "New password must be at least 6 characters"; break;
        }
        setError(message)
        setLoading(false)
      });
    }).catch((error) => {
      // An error occurred
      const errorCode = error.code;
      let message = "Something went wrong, try again"
      switch (errorCode) {
        case 'auth/invalid-email':
          message = "Invalid email address";break;
        case 'auth/user-not-found':
          message = "Email or password is incorrect";break;
        case 'auth/wrong-password':
          message = "Email or password is incorrect";break;
      }
      setError(message)
      setLoading(false)
    })
    
  }
  return (
    <AnnotadedSection
    title="Update Password"
    description={
      disabled ? "Your login method does not support changing email" :
      "Enter your current login information to update your password"
    }
    >
      <VStack spacing={2} align="left">
        <HStack spacing={2} align="center">
        <Input disabled={disabled} w="100%" placeholder='Email' type='email' value={curEmail} onChange={(e)=>setCurEmail(e.target.value)} />
        <Input disabled={disabled} w="100%" placeholder='Password' type='password' value={pass} onChange={(e)=>setPass(e.target.value)} />
        </HStack>
        <Input disabled={disabled} w="100%" placeholder='New Password' type='password' value={newPass} onChange={(e)=>setNewPass(e.target.value)} />
        <Input disabled={disabled} w="100%" placeholder='Confirm New Password' type='password' value={newPassConf} onChange={(e)=>setNewPassConf(e.target.value)} />
        {error &&
          <Alert status='error'>
            <AlertIcon />
            {error}
          </Alert>
        }
        { canSave &&
        <HStack justify="right">
          <Button colorScheme='primary' isLoading={loading} onClick={savePass}>Save</Button>
          <Button colorScheme='gray' onClick={reset}>Reset</Button>
        </HStack>
        }
      </VStack>
    </AnnotadedSection>
  )
}

function AccountSummarySection() {
  const user = useUser()

  let sub_id = null
  for (const p in user.products) {
    if (user.products[p].recurring)
      sub_id = p
  }
  let subInfo = null
  let prodInfo = null
  if (sub_id != null) {
    subInfo = user.products[sub_id]
    prodInfo = products[sub_id]
  }

  return (
    <Grid
    templateRows={['1fr']}
    templateColumns={['1fr', '1fr', '300px 1fr']}
    gap={4}
    >
      <GridItem>
      <HStack align="center" spacing={3}>
        <Avatar size="md"/>
        <VStack spacing={1} align="left">
        <Heading size="md">{user.profile.first_name} {user.profile.last_name}</Heading>
        <Text color="text.subtle">{user.auth.email}</Text>
        <Text>{user.org.info.name}</Text>
        </VStack>
      </HStack>
      </GridItem>
      <GridItem>
      <VStack spacing={1} align="left">
      {/* <HStack align="center" spacing={3}><Text color="text.subtle">Plan</Text><Text>{sub_id ? prodInfo.display : "None"}</Text></HStack> */}
        {/* <Link color="primary.default" as={RouterLink} to='/app/settings/billing'>Manage subscription</Link> */}
        </VStack>
      </GridItem>
    </Grid>
  )
}

export default function PageSettings() {
  const auth = getAuth()
  const disableEmailPass = auth.currentUser.providerData[0].providerId !== 'password'
  return (
      <PageLayoutContained size="md">
        <VStack spacing={8} align="left">
          <div id={"recaptcha-container"}></div>


          <Heading mb={8}>Settings</Heading>
          <AccountSummarySection/>
          <Divider/>
          <ChangeNameSection/>
          <Divider/>
          <ChangeEmailSection disabled={disableEmailPass}/>
          <Divider/>
          <ChangePhoneSection disabled={false}/>
          <Divider/>
          <ChangePasswordSection disabled={disableEmailPass}/>
          <Divider/>
        </VStack>
      </PageLayoutContained>
  );
}
