import * as React from 'react';
import {Box, AbsoluteCenter, CircularProgress} from '@chakra-ui/react'

export default function LoadingScreen() {
  return (
    <Box minH="100vh" textAlign="center" position='relative'>
        <AbsoluteCenter w="100%"><Box w="100%">
          <CircularProgress color="primary.default" isIndeterminate />
        </Box></AbsoluteCenter>
    </Box>
  );
}

export function LoadingWidget({width, height}) {
  return (
    <Box minH="100vh" textAlign="center" position='relative'>
        <AbsoluteCenter w="100%"><Box w="100%">
          <CircularProgress color="primary.default" isIndeterminate />
        </Box></AbsoluteCenter>
    </Box>
  );
}

