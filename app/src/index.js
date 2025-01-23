import { ColorModeScript } from '@chakra-ui/react';
import React, { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './App';
import reportWebVitals from './chakra/reportWebVitals';
import * as serviceWorker from './chakra/serviceWorker';
import {LicenseInfo} from "@mui/x-data-grid-pro";
import curry from "@inovua/reactdatagrid-community/packages/select-parent/curry";

import './style/styles.css'

import {theme} from './theme'
const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
LicenseInfo.setLicenseKey(
  '4bb4e0380ced9f6000f7f44b17a7f071T1JERVI6NDI5NjIsRVhQSVJZPTE2ODMxNTUwNjMwMDAsS0VZVkVSU0lPTj0x',
);
root.render(

      <StrictMode>
        <ColorModeScript initialColorMode={theme.config.initialColorMode} />
        <App />
      </StrictMode>

);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
serviceWorker.unregister();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
