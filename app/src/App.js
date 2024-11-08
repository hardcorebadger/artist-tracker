import React, {useState} from 'react';
import Routes from './routing/Routes';
import {
  BrowserRouter as Router
} from "react-router-dom";
import {ChakraProvider} from '@chakra-ui/react';
import {theme} from './theme'
export const StatisticTypeContext = React.createContext(null);

function App() {
    const [statisticTypes, setStatisticTypes] = useState(null);

    return (
    <ChakraProvider theme={theme}>
        <StatisticTypeContext.Provider  value={{ statisticTypes: statisticTypes, setStatisticTypes: setStatisticTypes }}>

          <Router>
            <Routes/>
          </Router>
        </StatisticTypeContext.Provider>

    </ChakraProvider>
  );
}

export default App;
