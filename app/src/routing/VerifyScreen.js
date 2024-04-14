import { useEffect, useState } from "react"
import { AbsoluteCenter, Box, Button, CircularProgress, Heading, Text, VStack } from "@chakra-ui/react"
import { sendEmailVerification, reload } from "firebase/auth"

export default function VerifyScreen({user}) {
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setInterval(() => {
      reload(user)
    }, 1000)
  }, [])

  const resendEmail = async () => {
    setLoading(true)
    await sendEmailVerification(user)
    setLoading(false)
  }
  return (
    <Box minH="100vh" textAlign="center" position='relative'>
        <AbsoluteCenter w="100%"><Box w="100%">
          <VStack spacing={2}>
          <CircularProgress color="primary.default" mb={6} isIndeterminate />
          <Heading>Verify your email</Heading>
          <Text>Check you email and click the link to continue</Text>
          <Button isLoading={loading} mt={6} onClick={resendEmail}>Resend Email</Button>
          </VStack>
        </Box></AbsoluteCenter>
    </Box>
  );
}