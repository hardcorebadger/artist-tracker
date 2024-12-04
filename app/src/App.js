import React, {useContext, useEffect, useState} from 'react';
import Routes from './routing/Routes';
import {
  BrowserRouter as Router
} from "react-router-dom";
import {ChakraProvider} from '@chakra-ui/react';
import {theme} from './theme'
import {httpsCallable} from "firebase/functions";
import {functions} from "./firebase";
import {bakeColumnDef} from "./components/DataGridConfig";
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

    const [users, setUsers] = useState(null)
    useEffect(() => {

        const loadOrgFilters = async () => {
            if (statisticTypes == null || statisticTypes?.length === 0 || linkSources == null || linkSources?.length === 0 || tagTypes === null) {
                const getTypes = httpsCallable(functions, 'get_type_definitions')
                getTypes().then((response) => {
                    setStatisticTypes(response.data.statistic_types)
                    setLinkSources(response.data.link_sources)
                    setTagTypes(response.data.tag_types)
                    bakeColumnDef(response.data.statistic_types, response.data.link_sources, response.data.tag_types, users, existingTags)

                });
            }
            const getTags = httpsCallable(functions, 'get_existing_tags')
            if (existingTags === null) {
                getTags().then((response) => {
                    setExistingTags(response.data.tags)
                    const newUsers = {}
                    for (const index in response.data.users) {
                        const user = response.data.users[index]
                        newUsers[user.id] = user
                    }

                    setUsers(newUsers)

                    bakeColumnDef(statisticTypes, linkSources, tagTypes, newUsers, response.data.tags)
                });
            }
        }
        loadOrgFilters()
    }, []);
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

    </ChakraProvider>
  );
}

export default App;
