import React from 'react'
import { StatusBar, useColorScheme } from 'react-native'
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Provider as PaperProvider, MD3LightTheme, MD3DarkTheme } from 'react-native-paper'

import ScanScreen from './src/screens/ScanScreen'
import DeviceDetailScreen from './src/screens/DeviceDetailScreen'

export type RootStackParamList = {
  Scan: undefined
  DeviceDetail: { device: any }
}

const Stack = createNativeStackNavigator<RootStackParamList>()

// 品牌色
const BRAND = '#667eea'
const BRAND_SECONDARY = '#764ba2'

// 浅色主题定制
const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: BRAND,
    primaryContainer: BRAND_SECONDARY,
    background: '#f5f7fa',
    surface: '#ffffff',
  },
}

// 暗色主题定制
const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#8fa0f5',
    primaryContainer: '#4a3f7a',
    background: '#121212',
    surface: '#1e1e2a',
    surfaceVariant: '#2a2a3a',
    onSurface: '#e2e2ec',
    onSurfaceVariant: '#a9a9bc',
    outline: '#4a4a5c',
  },
}

const lightNavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#ffffff',
    background: BRAND,
    card: BRAND,
    text: '#ffffff',
  },
}

const darkNavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#8fa0f5',
    background: '#1e1e2a',
    card: '#1e1e2a',
    text: '#e2e2ec',
  },
}

function App(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark'
  const paperTheme = isDark ? darkTheme : lightTheme
  const navTheme = isDark ? darkNavTheme : lightNavTheme

  return (
    <PaperProvider theme={paperTheme}>
      <NavigationContainer theme={navTheme}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'light-content'}
          backgroundColor={isDark ? '#1e1e2a' : BRAND}
        />
        <Stack.Navigator
          initialRouteName="Scan"
          screenOptions={{
            headerStyle: {
              backgroundColor: isDark ? '#1e1e2a' : BRAND
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
