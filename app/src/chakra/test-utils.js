import React from 'react';
import { render } from '@testing-library/react';
import {Provider} from "../components/ui/provider";

const AllProviders = ({ children }) => (
  <Provider >{children}</Provider>
);

const customRender = (ui, options) =>
  render(ui, { wrapper: AllProviders, ...options });

export { customRender as render };
