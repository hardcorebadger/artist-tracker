import {
    Box,
    Text,
    Input,
    InputGroup,
    useDisclosure,
    useOutsideClick,
    InputLeftElement
} from "@chakra-ui/react";
import {useEffect, useRef, useState} from "react";
import {AsYouType} from "libphonenumber-js";



export const PhoneNumberInput = ({ onChange, placeholder, value }) => {
    const ref = useRef(null);
    const initialCountry = "1";
    const [country, setCountry] = useState(initialCountry);
    const [countryFlag, setCountryFlag] = useState(`🇺🇸`);
    const [number, setNumber] = useState(value?.replace('+'+initialCountry, ''));

    const { isOpen, onToggle, onClose } = useDisclosure();

    useOutsideClick({
        ref: ref,
        handler: () => onClose()
    });

    useEffect(() => {
        if (country !== "" || number !== "") {
            onChange(`${country}${number}`);
        }
    }, [country, number, onChange]);

    const onCountryChange = (item) => {
        const parsedNumber = new AsYouType().input(`${country}${number}`);

        setCountry(item?.dial_code);
        setCountryFlag(item?.flag);
        onChange(parsedNumber);
        onClose();
    };

    const onPhoneNumberChange = (event) => {
        const value = event.target.value;
        const parsedNumber = new AsYouType().input(`${country}${number}`);

        setNumber(value);
        onChange(parsedNumber);
    };

    return (
        <>
            <Box as="section" ref={ref} position="relative" width={'100%'}>
                <InputGroup width={'100%'}>
                    <InputLeftElement width="5em" cursor="pointer" onClick={onToggle}>
                        <Text as="span" mr={3}>
                            {countryFlag}
                        </Text>

                    </InputLeftElement>
                    <Input
                        pl="5em"
                        type="tel"
                        value={number}
                        placeholder={placeholder}
                        onChange={onPhoneNumberChange}
                    />
                </InputGroup>

            </Box>
        </>
    );
};
