import React from 'react';
import {
  Box, Grid, Text,
  AbsoluteCenter,
} from '@chakra-ui/react';

import { Outlet } from "react-router-dom";
import { ColorModeSwitcher } from '../components/ColorModeSwitcher';

export default function DashboardLayout() {
  return (
    <Box> 
      <Box minH="100vh" textAlign="center" position='relative'>
          <AbsoluteCenter w="100%"><Box w="100%"><Outlet /></Box></AbsoluteCenter>
      </Box>
      <ColorModeSwitcher position="absolute" top="3" right="3"/>
      </Box>

  );
}

