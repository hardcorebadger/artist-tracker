import React, {useState} from 'react';
import Routes from './routing/Routes';
import {
  BrowserRouter as Router
} from "react-router-dom";
import {ChakraProvider} from '@chakra-ui/react';
import {theme} from './theme'
export const ColumnDataContext = React.createContext(null);

function App() {
    const [statisticTypes, setStatisticTypes] = useState(null);
    const [linkSources, setLinkSources] = useState(null);
    const [tagTypes, setTagTypes] = useState(null)
    return (
    <ChakraProvider theme={theme}>
        <ColumnDataContext.Provider  value={{ statisticTypes: statisticTypes,
            setStatisticTypes: setStatisticTypes,
            linkSources: linkSources,
            setLinkSources: setLinkSources,
            tagTypes: tagTypes,
            setTagTypes: setTagTypes,
        }}>

          <Router>
            <Routes/>
          </Router>
        </ColumnDataContext.Provider>

    </ChakraProvider>
  );
}

export default App;
