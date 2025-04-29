import { Image, StyleSheet, Platform, View, Pressable, Text } from 'react-native';import MapView from 'react-native-maps';
import {Marker} from 'react-native-maps';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import axios from 'axios';



export default function HomeScreen() {
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const PUBLIC_BASE_URL = process.env.EXPO_PUBLIC_BASE_URL // from .env file

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }
      let currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
    })();
  }, []);

    // this should be broken out into a separate file, that contains all API calls
    const create_new_challenge = async (location) => {
      try {
        const response = await axios.post(`${PUBLIC_BASE_URL}/location_pin`, {
          message: 'pressed your location!',
          location: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          },
        });
        if (response.status !== 200) {
          console.error('Failed to send log to server');
        }
      } catch (error) {
        console.error('Error sending log to server:', error);
      }
    };


  
  return (
    <View
      headerBackgroundColor={{ light: '#DCDCDC', dark: '#1D3D47' }}
      >

    {/* If breaking during deployment, it is because it needs an API https://docs.expo.dev/versions/latest/sdk/map-view/ 
    Github docs are also very helpful: https://github.com/react-native-maps/react-native-maps
    */}
    <View style={styles.map_container}>
    <Pressable 
        style={({ pressed }) => [
          styles.button, 
          { opacity: pressed ? 0.5 : 1 } // Halve opacity on press
        ]} 
        onPress={() => create_new_challenge(location).then(() => console.log("upload a photo"))}
      >
        <Text style={styles.buttonText}>+</Text>
        </Pressable>
    <MapView 
        style={styles.map} 
        showsUserLocation={true}
        
        region={
          location
            ? {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 1,
                longitudeDelta: 1,
              }
            : {
          latitude: 31.416077,
          longitude: 120.901488,
          latitudeDelta: 1,
          longitudeDelta: 1,
        }

      
      }
      >

{/* user location: note error handling should be added in here in case no location exists */}
{location?.coords && (
  <Marker
    coordinate={{
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    }}
    title="Your Location"
    description="You are here"
    pinColor="blue"
    onPress={() => create_new_challenge(location)}
  />
)}

        <Marker
          coordinate={{
            latitude: 31.416077,
            longitude: 120.901488,
          }}
          title="Geo Pin"
          description="This is a photo point."
          onPress={() => create_new_challenge(location)}
        />
      </MapView>
    </View>
    


    </View>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 32
  },
  map: {
    width: '100%',
    height: '100%',
  },
  map_container: {
    height: '100%',
    width: '100%',
  },
  button: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 10,
    zIndex: 10,
    elevation: 10,
  },
  buttonText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});
