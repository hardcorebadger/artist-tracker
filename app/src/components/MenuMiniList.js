import {Box, Button, Checkbox, HStack, Menu, MenuButton, MenuItem, MenuList, Text} from "@chakra-ui/react";
import Iconify from "./Iconify";
import {columnOptions} from "./DataGridConfig";
import MenuMiniListItem from "./MenuMiniListItem";

export default function MenuMiniList({key, title, items, totalEnabled}) {


    return (
        <Box w="100%" p={2} borderRadius="md" key={key}>
            <HStack justifyContent="space-between"><Text fontSize="sm">{title}</Text>
                <Menu>
                    <MenuButton colorScheme={totalEnabled > 0 ? 'primary' : 'gray'} size="xs" as={Button} rightIcon={<Iconify icon="mdi:caret-down" />}>
                        {totalEnabled > 0 ? totalEnabled : "-"}
                    </MenuButton>
                    <MenuList>
                        {items}
                    </MenuList>
                </Menu>
            </HStack>
        </Box>

    )

}