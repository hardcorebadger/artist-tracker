import {useContext, useEffect, useState} from "react";
import {ColumnDataContext} from "../App";
import {FormControl, FormLabel} from "@chakra-ui/react";
import {
    AutoComplete, AutoCompleteCreatable,
    AutoCompleteInput,
    AutoCompleteItem,
    AutoCompleteList,
    AutoCompleteTag
} from "@choc-ui/chakra-autocomplete";
import LoadingScreen, {LoadingWidget} from "../routing/LoadingScreen";

export default
function TagInput({setSelectedTags, initialTags, disabled}) {
    const {existingTags} = useContext(ColumnDataContext);

    const [localTags, setLocalTags] = useState(initialTags);

    useEffect(() => {

    }, [existingTags]);
    const options = existingTags?.map((tag) => {
        return tag.tag
    }) ?? []

    if (existingTags === null) {
        return (
            <LoadingWidget/>
        )
    }
    const onTagRemoved=(removed, item, tags) => {
        const newTags = tags.filter((tag) => tag.label !== removed.label).map((tag) => tag.label);
        setLocalTags(newTags)
        setSelectedTags(newTags)
    }
    return (

        <FormControl id="tags" w="100">
            <FormLabel>Tags</FormLabel>
            <AutoComplete  values={localTags}  isLoading={disabled}  creatable closeOnBlur={true} openOnFocus multiple

                          onSelectOption={(option) => {
                              setLocalTags([...localTags, option.item.value])
                              setSelectedTags([...localTags, option.item.value])
                          }}

                >
                <AutoCompleteInput>
                    {({ tags }) =>

                        tags.map((tag, tid) => (
                            <AutoCompleteTag
                                key={tid}
                                label={tag.label}
                                disabled={null}
                                onRemove={() => {
                                    console.log("B " + tid + " " + tag.label)
                                    // console.log(tag, tag.label + " "+ tid, tags)
                                    tag.onRemove()
                                    onTagRemoved(tag, tag.label, tags)
                                }}
                            />
                        ))
                    }
                </AutoCompleteInput>
                <AutoCompleteList>
                    {options.map((country, cid) => (
                        <AutoCompleteItem
                            key={`option-${cid}`}
                            value={country}
                            textTransform="capitalize"
                            _selected={{ bg: "whiteAlpha.50" }}
                            _focus={{ bg: "whiteAlpha.100" }}
                        >
                            {country}
                        </AutoCompleteItem>
                    ))}
                    <AutoCompleteCreatable/>
                </AutoCompleteList>
            </AutoComplete>
        </FormControl>
    );
}
