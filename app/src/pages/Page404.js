import React from 'react';
import {
  Box,
  Text,
  Link,
  VStack,
  Code,
  Grid,
  Button,
  Heading,
  AbsoluteCenter,
} from '@chakra-ui/react';
import { ColorModeSwitcher } from '../components/ColorModeSwitcher';
import Logo from '../components/Logo';
import { Link as RouterLink } from 'react-router-dom';
function PageDefault() {
  return (
    <Box minH="100vh" textAlign="center" position='relative'>
        <AbsoluteCenter w="100%"><Box w="100%">
        <VStack spacing={8}>
            <Logo />
            <Heading size="md">Well that's odd</Heading>
            <Text>
              The page you're looking for couldn't be found
            </Text>
            <Button as={RouterLink} to="/" colorScheme='primary'>Take me home</Button>
          </VStack>
        </Box></AbsoluteCenter>
    </Box>
    
  );
}

export default PageDefault;
