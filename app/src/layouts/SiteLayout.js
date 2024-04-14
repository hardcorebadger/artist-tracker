import React from 'react';
import {
  Box, Button, Container, HStack, Heading, Link
} from '@chakra-ui/react';

import { Outlet } from "react-router-dom";
import { ColorModeSwitcher } from '../components/ColorModeSwitcher';
import Logo from '../components/Logo';
import { Link as RouterLink, useLocation } from "react-router-dom";

export default function SiteLayout() {
  const location = useLocation()
  return (
    <Box w='100%'> 
    <Container maxW={1200} pt={5}>
      <HStack align='center' justify='space-between'>
        <RouterLink to='/' >
        <HStack align='center'>
          <Logo size={8}/>
          <Heading size='md'>Indiestack</Heading>
        </HStack>
        </RouterLink>
        <HStack align='center'>
          <ColorModeSwitcher/>
          {location.pathname !== '/' &&
          <Button as={RouterLink} to='/auth/login' colorScheme='gray' size='sm'>Login</Button>
          }
        </HStack>
      </HStack>
    </Container>
    <Outlet />

    </Box>
  );
}

