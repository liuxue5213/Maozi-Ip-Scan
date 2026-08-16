import React from 'react'
import { StatusBar } from 'react-native'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Provider as PaperProvider, MD3LightTheme } from 'react-native-paper'

import ScanScreen from './src/screens/ScanScreen'
import DeviceDetailScreen from './src/screens/DeviceDetailScreen'
import { ThemeProvider, useTheme } from './src/context/ThemeContext'

export type RootStackParamList = {
  Scan: undefined
  DeviceDetail: { device: any }
}

const Stack = createNativeStackNavigator<RootStackParamList>()

function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  )
}

function AppInner(): React.JSX.Element {
  const { theme: paperTheme } = useTheme()

  const navTheme = {
    ...DefaultTheme,
    dark: paperTheme.dark,
    colors: {
      ...DefaultTheme.colors,
      primary: paperTheme.colors.primary,
      background: paperTheme.colors.background,
      card: paperTheme.colors.elevation.level2,
      text: paperTheme.colors.onSurface,
    },
  }

  return (
    <PaperProvider theme={paperTheme}>
      <NavigationContainer theme={navTheme}>
        <StatusBar barStyle="light-content" backgroundColor="#667eea" />
        <Stack.Navigator
          initialRouteName="Scan"
          screenOptions={{
            headerStyle: {
              backgroundColor: '#667eea'
            },
            headerTintColor: '#ffffff',
            headerTitleStyle: {
              fontWeight: 'bold'
            }
          }}
        >
          <Stack.Screen
            name="Scan"
            component={ScanScreen}
            options={{ title: '🐱 Maozi-Ip-Scan' }}
          />
          <Stack.Screen
            name="DeviceDetail"
            component={DeviceDetailScreen}
            options={{ title: '设备详情' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  )
}

export default App
