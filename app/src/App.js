import React, {useContext, useEffect, useState} from 'react';
import Routes from './routing/Routes';
import {
  BrowserRouter as Router
} from "react-router-dom";
import {ChakraProvider, ColorModeProvider} from '@chakra-ui/react';
import {theme} from './theme'
import {httpsCallable} from "firebase/functions";
import {functions, useAuth, v3_url} from "./firebase";
import {useUser} from "./routing/AuthGuard";
import * as admin from "./firebase";

export const ColumnDataContext = React.createContext(null);
export const CurrentReportContext = React.createContext(null);
function getInitialState(key) {
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : null
}

function App() {
    const [statisticTypes, setStatisticTypes] = useState(null);
    const [linkSources, setLinkSources] = useState(null);
    const [tagTypes, setTagTypes] = useState(null)
    const [activeArtist, setActiveArtist] = useState(null)
    const [existingTags, setExistingTags] = useState(null)
    const [currentReport, setCurrentReport] = useState(getInitialState('currentReport'))
    const [currentRows, setCurrentRows] = useState(null)
    const [currentQueryModel, setCurrentQueryModel] = useState(getInitialState('currentQueryModel'))
    const [currentUser, setCurrentUser] = useState(null)
    const [organization, setOrganization] = useState(null)
    const is_dev = location.hostname === "localhost" || location.hostname === '127.0.0.1'

    if (!is_dev && !location.hostname.includes('indiestack')) {
        window.location = "https://indiestack.app/" + window.location.pathname;

    }

    const [users, setUsers] = useState(null)
    const loadOrgFilters = async (user, force = false) => {
        if (!user) {
            return;
        }
        console.log(user)
        if (statisticTypes == null || statisticTypes?.length === 0 || linkSources == null || linkSources?.length === 0 || tagTypes === null) {
            goFetch(user, 'GET', 'get-type-defs').then((response) => {
                console.log(response)
                setStatisticTypes(response?.statistic_types)
                setLinkSources(response?.link_sources)
                setTagTypes(response?.tag_types)
            });
        }
        if (existingTags === null || force) {
            goFetch(user, 'GET','get-existing-tags'+(force ? '?force='+(new Date()) : '')).then((response) => {
                setExistingTags(response.tags)
                const newUsers = {}
                for (const index in response.users) {
                    const user = response.users[index]
                    newUsers[user.id] = user
                }
                setUsers(newUsers)
                setCurrentUser(response.current_user ?? null)
            });
        }
    }
    useEffect(() => {
        if (currentQueryModel) {
            localStorage.setItem('currentQueryModel', JSON.stringify(currentQueryModel))
        } else {
            localStorage.removeItem('currentQueryModel')
        }
    }, [currentQueryModel])

    useEffect(() => {
        if (currentReport) {
            localStorage.setItem('currentReport', JSON.stringify(currentReport))
        } else {
            localStorage.removeItem('currentReport')
        }
    }, [currentReport])
    return (
    <ChakraProvider theme={theme}>
        <ColorModeProvider>
        <ColumnDataContext.Provider  value={{
            statisticTypes: statisticTypes,
            setStatisticTypes: setStatisticTypes,
            linkSources: linkSources,
            setLinkSources: setLinkSources,
            tagTypes: tagTypes,
            setTagTypes: setTagTypes,
            setActiveArtist: setActiveArtist,
            activeArtist: activeArtist,
            existingTags: existingTags,
            setExistingTags: setExistingTags,
            currentUser: currentUser,
            organization: organization,
            setOrganization: setOrganization,
            refreshFilters: loadOrgFilters,
            users: users,
            setUsers: setUsers,

        }}>
            <CurrentReportContext.Provider value={{
                currentReport: currentReport,
                setCurrentReport: setCurrentReport,
                currentRows: currentRows,
                setCurrentRows: setCurrentRows,
                currentQueryModel: currentQueryModel,
                setCurrentQueryModel: setCurrentQueryModel
            }}>

          <Router>
            <Routes/>
          </Router>
        </CurrentReportContext.Provider>

        </ColumnDataContext.Provider>
        </ColorModeProvider>
    </ChakraProvider>
  );
}

export default App;

export async function goFetch (user, method, path, body) {
    const token = await user?.auth?.getIdToken()

    var requestOptions = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'X-Organization': user?.profile?.organization ?? 'NA'
        },
        body: method === 'GET' ? null : JSON.stringify(body),
    }
    if (body) {
        for (let key in body) {
            if (typeof (body[key]) === 'object') {
                body[key] = JSON.stringify(body[key])
            }
        }
    }

    return fetch(v3_url + path + ((method === 'GET' && body) ? '?' + new URLSearchParams(body).toString() : ''), requestOptions)
        .then(res => res.json())

}