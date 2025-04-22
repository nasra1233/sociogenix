import React from 'react';
import ReactDOM from 'react-dom';
import App from './frontend_src_App';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#f50057' }
  },
  typography: {
    fontFamily: 'Roboto, sans-serif',
    h4: { fontWeight: 600 },
    h6: { fontWeight: 500 }
  }
});

ReactDOM.render(
  <ThemeProvider theme={theme}>
    <App />
  </ThemeProvider>,
  document.getElementById('root')
);
