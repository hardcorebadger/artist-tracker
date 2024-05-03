import { createContext, useContext, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Navigate } from 'react-router-dom';
import LoadingScreen from './LoadingScreen';
import { db, useAuth, signOut } from '../firebase';
import { reload, sendEmailVerification } from 'firebase/auth';
import { useCollection, useDocument } from 'react-firebase-hooks/firestore';
import { collection, doc, query, where } from 'firebase/firestore';
import VerifyScreen from './VerifyScreen';
import { products as productMap } from '../config'


// ----------------------------------------------------------------------

const GUARD_EMAIL_VERIFICATION = false

const UserContext = createContext()

AuthGuard.propTypes = {
  children: PropTypes.node,
};

export default function AuthGuard({ children, onboarding}) {
  const [user, loading, error] = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to='/auth/login' />;
  } 
  return <ProfileGuard user={user} onboarding={onboarding}>{children}</ProfileGuard>
  
}


function ProfileGuard({user, onboarding, children}) {
  const [profile, profileLoading, profileError] = useDocument(
    doc(db, 'users', user.uid),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  )
  
  // const [products, productsLoading, productsError] = useCollection(
  //   collection(db, 'users', user.uid, 'products'),
  //   {
  //     snapshotListenOptions: { includeMetadataChanges: true },
  //   }
  // )

  if (profileLoading) {
    return <LoadingScreen />;
  }

  if (profileError || !profile || profile.data() === undefined) {
    signOut()
    return <Navigate to='/auth/login' />;
  } 

  const profileData = profile.data()

  // let productData = null
  // if (products) {
  //   productData = {}
  //   products.docs.map((doc) => {productData[doc.data().id] = doc.data()})
  // }

  // const main = <UserContext.Provider value={{
  //   products: productData,
  //   profile: profile.data(),
  //   auth: user,
  //   hasAccessLevel: (level) => {
  //     let access = false
  //     for (const pid in productData) {
  //       if (productData[pid].status != "expired") {
  //         if (pid in productMap) {
  //           if (productMap[pid].access.includes(level)) {
  //             access = true
  //           }
  //         }
  //       }
  //     }
  //     return access
  //   }
  // }}>{children}</UserContext.Provider>;

  
  if (!onboarding) {
    if (GUARD_EMAIL_VERIFICATION) {
      return <EmailVerificationGuard><OrganizationGuard user={user} profileData={profileData} orgId={profileData.organization}>{children}</OrganizationGuard></EmailVerificationGuard>
    } else {
      return <OrganizationGuard user={user} profileData={profileData} orgId={profileData.organization}>{children}</OrganizationGuard>
    }
  } else {
    if (profileData.organization != null) {
      return <Navigate to='/app' />;
    }
    const main = <UserContext.Provider value={{
      org: null,
      auth: user,
      profile: profileData,
    }}>{children}</UserContext.Provider>;
    return main;
  }
}

function OrganizationGuard({user, profileData, orgId, children}) {

  if (!orgId) {
    return <Navigate to='/onboarding/join-team' />;
  }

  const [org, orgLoading, orgError] = useDocument(
    doc(db, 'organizations', orgId),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  )
  
  const [products, productsLoading, productsError] = useCollection(
    collection(db, 'organizations', orgId, 'products'),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  )

  const [users, usersLoading, usersError] = useCollection(
    query(collection(db, 'users'), 
      where("organization", "==", orgId),
    ),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  )

  if (orgLoading || productsLoading || usersLoading) {
    return <LoadingScreen />;
  }

  if (orgError || !org || org.data() === undefined) {
    signOut()
    return <Navigate to='/auth/login' />;
  } 

  let productData = null
  if (products) {
    productData = {}
    products.docs.map((doc) => {productData[doc.data().id] = doc.data()})
  }

  let orgUsers = {}
  if (users) {
    users.docs.forEach(d => {
      orgUsers[d.id] = d.data()
    })
  }

  const main = <UserContext.Provider value={{
    org: {
      products: productData,
      id: orgId,
      info: org.data(),
      users: orgUsers
    },
    profile: profileData,
    auth: user,
    hasAccessLevel: (level) => {
      let access = false
      for (const pid in productData) {
        if (productData[pid].status != "expired") {
          if (pid in productMap) {
            if (productMap[pid].access.includes(level)) {
              access = true
            }
          }
        }
      }
      return access
    }
  }}>{children}</UserContext.Provider>;

  if (GUARD_EMAIL_VERIFICATION) {
    return <EmailVerificationGuard>{main}</EmailVerificationGuard>
  } else {
    return main
  }
}

function EmailVerificationGuard({children}) {
  const [user, loading, error] = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to='/auth/login' />;
  } 

  if (!user.emailVerified) {
    return <VerifyScreen user={user}/>
  }
  
  return <>{children}</>
}


export const useUser = () => {
  const context = useContext(UserContext)

  if (!context) throw new Error('User context must be use inside AuthGuard');

  return context;
}