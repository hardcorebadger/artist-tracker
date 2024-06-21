import { Box} from "@chakra-ui/react";
import Iconify from "./Iconify";

export default function FavoritesButton({filled, action, sx, data}) {
const click = () => {
    action(data)
}
  return (
  <Box className="favorite-btn" sx={{cursor:'pointer', ...sx}} onClick={click}>
    {!filled ?
    <Iconify sx={{color:'#bbb', '.favorite-btn:hover &': {color:'#333'}}} size={20} icon='mdi:star-outline' />
    :
    <Iconify sx={{color:'#329795', '.favorite-btn:hover &': {color:'#287978'}}} size={20} icon='mdi:star' />
    }
    </Box>
  )

}