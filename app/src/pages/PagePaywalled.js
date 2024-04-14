import {
  Text,
  VStack,
  Heading,
} from '@chakra-ui/react';
import { PageLayoutContained } from '../layouts/DashboardLayout';
import { useUser } from '../routing/AuthGuard';


function PagePaywalled() {
  const user = useUser()

  return (
      <PageLayoutContained size="sm">
        <VStack spacing={5} align="left">
          <Heading>{user.profile.first_name}, you've made it past the paywall!</Heading>
          <Text>Looks like you bought the plan, so now you can see this page!
          </Text>
         
        </VStack>
      </PageLayoutContained>
  );
}

export default PagePaywalled;
