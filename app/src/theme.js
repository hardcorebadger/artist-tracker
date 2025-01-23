import { extendTheme } from '@chakra-ui/react'

const primary_color = "teal";
const color_mode = "dark";

export const theme = extendTheme({
  colorMode: color_mode,
  initialColorMode: 'system',
  useSystemColorMode: true,
  semanticTokens: {
    colors: {
      text: {
        default: {_light: "gray.800", _dark: "whiteAlpha.900"},
        inverse: {_light: "gray.800", _dark: "whiteAlpha.900"},
        subtle: {_light: "gray.600", _dark: "gray.400"}
      },
      bg: {
        default: {_light: 'white',_dark: 'gray.800'},
        inverse: {_light: 'gray.800',_dark: 'white'},
        well: {_light: 'gray.100',_dark: 'gray.900'}
      },
      primary: {
        default: {_light: primary_color,_dark: primary_color},
        50: primary_color+".50",
        100: primary_color+".100",
        200: primary_color+".200",
        300: primary_color+".300",
        400: primary_color+".400",
        500: primary_color+".500",
        600: primary_color+".600",
        700: primary_color+".700",
        800: primary_color+".800",
        900: primary_color+".900",
        mode: {
            _light: primary_color+".500", _dark:primary_color+".400",
            50: {_light: primary_color+".50", _dark:primary_color+".900"},
            100: {_light: primary_color+".100", _dark:primary_color+".800"},
            200: {_light: primary_color+".200", _dark:primary_color+".700"},
            300: {_light: primary_color+".300", _dark:primary_color+".600"},
            400: {_light: primary_color+".400", _dark:primary_color+".500"},
            500: {_light: primary_color+".500", _dark:primary_color+".400"},
            600: {_light: primary_color+".600", _dark:primary_color+".300"},
            700: {_light: primary_color+".700", _dark:primary_color+".200"},
            800: {_light: primary_color+".800", _dark:primary_color+".100"},
            900: {_light: primary_color+".900", _dark:primary_color+".50"}
        },
      },
    },
  },
})