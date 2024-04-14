import PropTypes from 'prop-types';
// icons
import { Icon } from '@iconify/react';
// @mui
import { Box, chakra } from '@chakra-ui/react';

// ----------------------------------------------------------------------

Iconify.propTypes = {
  icon: PropTypes.oneOfType([PropTypes.element, PropTypes.string]),
  sx: PropTypes.object,
};

export default function Iconify({ icon, size, sx, ...other }) {
  return <Box  sx={{ ...sx }}  {...other} ><Icon icon={icon} width={size}/></Box>;
}