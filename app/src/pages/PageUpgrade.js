import {
  Text,
  VStack,
  Heading,
  Container,
  SimpleGrid,
  RadioGroup,
  Button,
} from "@chakra-ui/react";
import { PageLayoutContained } from "../layouts/DashboardLayout";
import PlanCard from "../components/PlanCard";
import { useState } from "react";
import {goFetch} from "../App";
import {useUser} from "../routing/AuthGuard";
import {toaster} from "../components/ui/toaster";

function PageUpgrade() {
  const [selectedPlan, setSelectedPlan] = useState("Indiestack Trial Monthly");
    const [subscribeLoading, setSubscribeLoading] = useState(false);
  const handlePlanChange = (value) => {
    setSelectedPlan(value);
  };
  const user = useUser();

  const checkout = async () => {
    setSubscribeLoading(true);
    goFetch(user, 'POST','checkout', {
    }).then((response) => {
      console.log(response);
      setSubscribeLoading(false);
      if (response.hasOwnProperty("checkout")) {
        window.location.href = (response.checkout.url);
      } else {
        toaster.create({
          title: 'Failed to generate checkout',
          description: "We were unable to generate a link for your Stripe checkout.",
          status: 'error',
          duration: 9000,
          isClosable: true,
        })
      }
    }).catch((error) => {
      setSubscribeLoading(false);

      toaster.create({
        title: 'Failed to generate checkout',
        description: "We were unable to generate a link for your Stripe checkout.",
        status: 'error',
        duration: 9000,
        isClosable: true,
      })
    })
  }

  const plans = [
    {
      value: "Indiestack Trial Monthly",
      planName: "Indiestack Trial Monthly",
      price: "$50/mo",
      description: "A special limited offer",
      enabled: true,
      features: [
        { text: "> 1k artists", has: false },
        { text: "Multiple Users", has: true },
        { text: "SMS Support", has: true },
        { text: "Artist Lookalikes", has: true },
        { text: "Artist Reports", has: true },
        { text: "User Artist Attribution", has: true },
      ],
    },
    {
      value: "Indiestack Enterprise",
      planName: "Indiestack Enterprise",
      price: "$500/mo",
      description: "Unleash the firehose",
      enabled: false,
      features: [
        { text: "> 1k artists", has: true },
        { text: "Multiple Users", has: true },
        { text: "SMS Support", has: true },
        { text: "Artist Lookalikes", has: true },
        { text: "Artist Reports", has: true },
        { text: "User Artist Attribution", has: true },
      ],
    },
  ];

  return (
      <PageLayoutContained size="sm">
        <Container maxW="700" textAlign="center" pb="50">
          <VStack align="center" spacing={5}>
            <Heading size="3xl">Upgrade to get access</Heading>
            <Text color="text.subtle" size="lg">
              Subscribe now to our Trial period for only $50/month
            </Text>
          </VStack>
        </Container>
        <Container maxW="800" pb="100">
          <RadioGroup onChange={handlePlanChange} value={selectedPlan}>
            <SimpleGrid columns={2} spacing={10}>
              {plans.map((plan) => (
                  <PlanCard
                      key={plan.value}
                      value={plan.value}
                      planName={plan.planName}
                      isDisabled={!plan.enabled}
                      price={plan.price}
                      description={plan.description}
                      features={plan.features}
                  />
              ))}
            </SimpleGrid>
          </RadioGroup>
          <VStack pt="6">
            <Button colorScheme="primary" onClick={checkout} isLoading={subscribeLoading}>
              Subscribe to {selectedPlan}
            </Button>
          </VStack>
        </Container>
      </PageLayoutContained>
  );
}

export default PageUpgrade;