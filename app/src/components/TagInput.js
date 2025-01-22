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

    return (

        <FormControl id="tags" w="100">
            <FormLabel>Tags</FormLabel>
            <AutoComplete defaultValues={localTags ?? []} isLoading={disabled} creatable openOnFocus multiple
                          onChange={vals => {
                              console.log(vals)
                              setLocalTags(vals)
                              setSelectedTags(vals) }}
                          onTagRemoved={(removed, item, tags) => {
                              console.log(removed, item, tags)
                              const newTags = tags.filter((tag) => tag !== removed)
                              console.log(newTags)
                              setLocalTags(newTags)
                              setSelectedTags(newTags)
                          }}
                >
                <AutoCompleteInput>
                    {({ tags }) =>
                        tags.map((tag, tid) => (
                            <AutoCompleteTag
                                key={tid}
                                label={tag.label}

                                onRemove={tag.onRemove}
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
