import {
  Text,
  VStack,
  Heading,
  Container,
  SimpleGrid,
  RadioGroup,
  Button, useToast,
} from "@chakra-ui/react";
import { PageLayoutContained } from "../layouts/DashboardLayout";
import PlanCard from "../components/PlanCard";
import { useState } from "react";
import {goFetch} from "../App";
import {useUser} from "../routing/AuthGuard";

function PageUpgrade() {
  const [selectedPlan, setSelectedPlan] = useState("Indiestack Trial Pricing");
  const toast = useToast()
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
        toast({
          title: 'Failed to generate checkout',
          description: "We were unable to generate a link for your Stripe checkout.",
          status: 'error',
          duration: 9000,
          isClosable: true,
        })
      }
    }).catch((error) => {
      setSubscribeLoading(false);

      toast({
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
      value: "Indiestack Trial Pricing",
      planName: "Indiestack Trial Pricing",
      price: "$50/mo",
      description: "Throughout the beta period",
      enabled: true,
      features: [
        { text: "> 1k artists", has: true },
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
      price: "$899/mo",
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
      <PageLayoutContained size="sm" sx={{overflowY: 'hidden'}}>
        <Container  textAlign="center" pb="50" sx={{overflowY: 'hidden'}}>
          <VStack align="center" spacing={5}>
            <Heading size="3xl">Select a plan</Heading>
            <Text color="text.subtle" size="lg">
              You've been granted trial access.
            </Text>
          </VStack>
        </Container>
        <Container maxW="800" sx={{maxHeight: {xs: 'none', md: '50vh'}, overflowY: 'hidden'}}>
          <RadioGroup onChange={handlePlanChange} value={selectedPlan}>
            <SimpleGrid columns={2} minChildWidth={'250px'} spacing={10}>
              {plans.map((plan) => (
                  <PlanCard
                      key={plan.value}
                      value={plan.value}
                      planName={plan.planName}
                      isDisabled={!plan.enabled}
                      price={plan.price}
                      onChange={handlePlanChange}
                      description={plan.description}
                      features={plan.features}
                  />
              ))}
            </SimpleGrid>
          </RadioGroup>
          <VStack pt="6">
            <Button colorScheme="primary" onClick={checkout} isLoading={subscribeLoading}>
              Continue to Payment
            </Button>
          </VStack>
        </Container>
      </PageLayoutContained>
  );
}

export default PageUpgrade;