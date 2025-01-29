import {Box, Button, Checkbox, HStack, Menu, MenuContent, MenuItem, MenuTrigger, Text} from "@chakra-ui/react";
import Iconify from "./Iconify";
import MenuMiniListItem from "./MenuMiniListItem";

export default function MenuMiniList({title, items, totalEnabled}) {
    return (
        <Box w="100%" p={2} borderRadius="md">
            <HStack justifyContent="space-between"><Text fontSize="sm">{title}</Text>
                <Menu>
                    <MenuTrigger colorScheme={totalEnabled > 0 ? 'primary' : 'gray'} size="xs" as={Button} rightIcon={<Iconify icon="mdi:caret-down" />}>
                        {totalEnabled > 0 ? totalEnabled : "-"}
                    </MenuTrigger>
                    <MenuContent>
                        {items}
                    </MenuContent>
                </Menu>
            </HStack>
        </Box>

    )

}