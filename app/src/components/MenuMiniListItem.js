import {Checkbox, HStack, MenuItem, Text} from "@chakra-ui/react";
import {columnOptions} from "./DataGridConfig";


export default function MenuMiniListItem({parentKey, subKey, columnSelection, key, title, setColumn}) {
    return (
        <MenuItem key={key}>
            <HStack w="100%" justifyContent="space-between">
                <Text fontSize="sm">
                    {title}
                </Text>
                <Checkbox
                    colorScheme='primary'
                    isChecked={columnSelection[parentKey][subKey]}
                    onChange={e => setColumn(e.target.checked, parentKey, subKey)}>
                </Checkbox>
            </HStack>
        </MenuItem>
    )
}