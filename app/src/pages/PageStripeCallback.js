import {useUser} from "../routing/AuthGuard";
import {VStack, Text} from "@chakra-ui/react";
import {PageLayoutContained} from "../layouts/DashboardLayout";
import {useSearchParams} from "react-router-dom";
import {useEffect, useState} from "react";
import {goFetch} from "../App";
import {spotify_redirect} from "../firebase";


export default function PageStripeCallback() {
    const user = useUser()
    const [searchParams, setSearchParams] = useSearchParams();
    const [code, setCode] = useState(searchParams.get('code') ?? null)
    const error = (searchParams.get('error') ?? null);
    const [running, setRunning] = useState(false)
    const state = searchParams.get('state')


    return (

        <PageLayoutContained size="lg">
            <VStack spacing={10} align="left">
                <Text>Stripe Account Link</Text>

            </VStack>
        </PageLayoutContained>

    )
}