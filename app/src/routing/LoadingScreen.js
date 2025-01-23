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

export function LoadingWidget({width = '100%', height = '100vh'}) {
  return (
    <Box minH={height} textAlign="center" position='relative'>
        <AbsoluteCenter w={width}><Box w={width}>
          <CircularProgress color="primary.default" isIndeterminate />
        </Box></AbsoluteCenter>
    </Box>
  );
}

