import { Grid, GridItem, Heading, VStack, Text } from "@chakra-ui/react";

export default function AnnotadedSection({title, description, children}) {
  return (
    <Grid
    templateRows={['1fr']}
    templateColumns={['1fr', '1fr', '300px 1fr']}
    gap={4}
    >
      <GridItem>
        <VStack spacing={1} align="left">
        <Heading size="sm">{title}</Heading>
        <Text>{description}</Text>
        </VStack>
      </GridItem>
      <GridItem>
      {children}
      </GridItem>
    </Grid>
  )
}