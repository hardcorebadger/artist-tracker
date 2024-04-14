import { Box, AbsoluteCenter, Button, Text, VStack, Heading, Skeleton } from '@chakra-ui/react';
import { useUser } from '../routing/AuthGuard';
import { Link as RouterLink } from 'react-router-dom';

export default function AccessGate({level, children, message = "Upgrade to use this feature", cta ="Upgrade"}) {
  //hi
  const user = useUser()

  if (user.hasAccessLevel(level)) {
      return <>{children}</>
  } else {
    return (
        <Box textAlign="center" p={3}>
          <VStack spacing={2}>
            <Heading size="sm">{message}</Heading>
            <Button colorScheme="primary" as={RouterLink} to="/app/upgrade">{cta}</Button>
          </VStack>
        </Box>
    );
  }
}

export function AccessSkeleton({level, as = Skeleton, children}) {
  const user = useUser()
  const As = as
  return (
    <As isLoaded={user.hasAccessLevel(level)} >{children}</As>
  );
}

export function AccessOverlay({level, children}) {
  const user = useUser()
  if (user.hasAccessLevel(level)) {
    return <></>
  } else {
    return (
      <AbsoluteCenter>{children}</AbsoluteCenter>
    )
  }
}