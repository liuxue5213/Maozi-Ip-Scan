import React from 'react'
import { StatusBar } from 'react-native'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Provider as PaperProvider, MD3LightTheme } from 'react-native-paper'

import ScanScreen from './src/screens/ScanScreen'
import DeviceDetailScreen from './src/screens/DeviceDetailScreen'

export type RootStackParamList = {
  Scan: undefined
  DeviceDetail: { device: any }
}

const Stack = createNativeStackNavigator<RootStackParamList>()

// 浅色主题定制
const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#667eea',
    primaryContainer: '#764ba2',
    background: '#f5f7fa',
    surface: '#ffffff',
  },
}

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#ffffff',
    background: '#667eea',
    card: '#667eea',
    text: '#ffffff',
  },
}

function App(): React.JSX.Element {
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
