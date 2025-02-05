import {useState, useEffect, Children, useContext, useRef} from 'react';
import {
  Box, Grid,
  GridItem,
  HStack,
  Heading,
  Button, IconButton,
  Text, Container,
  VStack, useControllableState, VisuallyHidden,
  Accordion, AccordionItem, AccordionPanel, AccordionButton,
  Link, Avatar, Menu, MenuButton, MenuList, MenuItem, useDisclosure, useColorMode
} from '@chakra-ui/react';
import { useMediaQuery } from '@chakra-ui/react'
import { Outlet, useNavigate } from "react-router-dom";
import Logo from '../components/Logo';
import { Link as RouterLink, useLocation } from "react-router-dom";
import { ColorModeSwitcher } from '../components/ColorModeSwitcher';
import Iconify from "../components/Iconify"
import { use100vh } from '../hooks/100vh';
import { signOut } from '../firebase';
import { useUser } from '../routing/AuthGuard';
import { collection, query, where } from 'firebase/firestore';
import { useCollection } from 'react-firebase-hooks/firestore';
import { db } from '../firebase';
import { deepCopy } from '../util/objectUtil';
import {ColumnDataContext, CurrentReportContext, goFetch} from "../App";
import {AutoComplete, AutoCompleteInput, AutoCompleteItem, AutoCompleteList} from "@choc-ui/chakra-autocomplete";
import ChangeOrganizationModal from "../components/ChangeOrganizationModal";
import UserAvatar from "../components/UserAvatar";

const basePadding = 6

const navItemConfig = [
  {path: "/app/home", name: "Dashboard", icon: "mdi:user"},
  {path: "/app/reports", name: "Reports", icon: "mdi:report-box",
  children: [
  ]
  },
  {path: "/app/imports", name: "Imports", icon: "mdi:upload"},
  // {path: "/app/paywalled", name: "Paywalled", icon: "mdi:disk"},
  {path: "/app/settings", name: "Settings", icon: "mdi:settings",
  children: [
    {path: "/app/settings/account", name: "Account"},
    {path: "/app/settings/billing", name: "Billing"},
  ]
  },
]

function UserBlock({currentUser, openOrgModal}) {
  const user = useUser()
  const { colorMode, toggleColorMode } = useColorMode()

  return (
    <Box w="100%" p={basePadding} pl={basePadding+2} pr={basePadding+2} >
    <HStack align="center" justify="space-between">
        <UserAvatar userId={user.auth.uid} userAuth={user} subtext={user.org.info.name}/>
      <Menu computePositionOnMount={true}>
        <MenuButton
          as={IconButton}
          aria-label='Account'
          icon={<Iconify size={20} icon="mdi:dots-horizontal"/>}
          variant='ghost'

        />
        <MenuList>
          <MenuItem onClick={signOut} >
            Log Out
          </MenuItem>
          <MenuItem as={RouterLink} to="/app/settings" >
            Account Settings
          </MenuItem>
          <MenuItem onClick={toggleColorMode}>
            <HStack  align={'center'} justify={'center'}> <Text>{colorMode === 'dark' ? 'Light' : 'Dark'} Mode</Text> <Iconify icon={(colorMode === 'light' ? 'material-symbols:dark-mode-outline' : 'material-symbols-light:light-mode')} /></HStack>
          </MenuItem>
          {currentUser?.admin ? (
            <MenuItem onClick={openOrgModal} >
              Change Organization
            </MenuItem>
          ) : null}
        </MenuList>
      </Menu>
    </HStack>
    </Box>
  )
}

function NavItem({icon, path, display, index, children, clickFirst}) {
  const navigate = useNavigate()

  const active = (path === index)
  const subActive = (index.includes(path))
  const expanded = (active || subActive)
  const accordionIndex = expanded ? [0] : []

  const hasChildren = Children.count(children) > 0

  const padding = icon ? 5 : 2

  const onClick = () => {
    if (clickFirst) {
      clickFirst(path)
    }
    navigate(path)
  }

  return (
    <Box w="100%" >
    <Button colorScheme='primary' variant='ghost' w="100%" size="sm" pl={3} pr={3} pt={padding} pb={padding} sx={{
      background: active ? "primary.mode.50" : "transparent",
    }}  
    _hover={{background: "primary.mode.50"}}
    _active={{background: "primary.mode.100"}}
    onClick={onClick}
    >
      <Box w="100%" textAlign="left">
      <HStack align='center' justify='space-between'>
        <HStack w="100%" align='center'>
          <Box w="30px"><Iconify size={20}color={(active || subActive) ? "primary.mode.500" : "text.subtle"} icon={icon}/></Box>
          <Text fontSize='sm' fontWeight="medium" color={(active || subActive) ? "text.default" : "text.subtle"}>{display}</Text>
        </HStack>
        {hasChildren &&
        <Iconify size={20}color={active ? "primary.mode.500" : "text.subtle"} icon="mdi:chevron-down"
        sx ={{
          transform: expanded? 'rotate(180deg)' : 'rotate(0deg)',
          transition: '0.2s'
        }}
        /> 
        }
        </HStack>
      </Box>
    </Button>
    {hasChildren &&
    <Accordion p={0} index={accordionIndex} allowMultiple>
      <AccordionItem p={0} border="none">
      <VisuallyHidden><AccordionButton></AccordionButton></VisuallyHidden>
        <AccordionPanel pt={2} pl={0} pr={0} pb={0} >
          <VStack spacing={2}>
            {children}
          </VStack>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
    }
    </Box>
  )
}

function NavBar({navItems, currentUser, organizations, openOrgModal}) {
  const location = useLocation()
  const index = location.pathname
  const {setActiveArtist} = useContext(ColumnDataContext)
  const {setCurrentQueryModel, setCurrentRows, setCurrentReport} = useContext(CurrentReportContext)


  return (
  <Box pl={basePadding} pr={basePadding} pt={3} w="100%" h="100%" position="relative"
  sx ={{
    borderRightColor: 'well',
    borderRightStyle: 'solid',
    borderRightWidth: '1px'
  }}
  >
    <VStack spacing={3}>
      {navItems.map(item => (
        <NavItem path={item.path} key={item.path} display={item.name} index={index} icon={item.icon}>
          {item.children &&
            item.children.map(item => (
              <NavItem clickFirst={() => {
                setCurrentQueryModel(null)
                setCurrentReport(null)


              }} path={item.path} key={item.path} display={item.name} index={index} />
            ))
          }
        </NavItem>
      ))}
    </VStack>

    <Box position="absolute" bottom={0} left={0} right={0} w="100%"
    bgColor="bg.default"
     sx ={{
      borderTopColor: 'well',
      borderTopStyle: 'solid',
      borderTopWidth: '1px',
    }}
    >
      <UserBlock currentUser={currentUser} openOrgModal={openOrgModal} />
    </Box>
  </Box>
  )
}

function LogoBlock() {
  return (
  <Box h="100%" p={basePadding} pl={basePadding+2}
  sx ={{
    borderRightColor: 'well',
    borderRightStyle: 'solid',
    borderRightWidth: '1px'
  }}
  >
    <RouterLink to='/' >
      <HStack h="100%" align='center'>
        <Logo size={7}/>
        <Heading size='sm'>Indiestack</Heading>
      </HStack>
    </RouterLink>
  </Box>
  );
}

function Header({navItems}) {
  const location = useLocation()
  const getBreadcrumbs = () => {
    let crumbs = []
    navItems.forEach(item => {
      if (location.pathname === item.path) {
        crumbs.push({name: item.name, icon:item.icon, path:item.path})
        return crumbs
      }
      else if (location.pathname.includes(item.path)) {
        crumbs.push({name: item.name, icon:item.icon, path:item.path})
        item.children?.forEach(child => {
          if (location.pathname.includes(child.path)) {
            crumbs.push({name: child.name, icon:child.icon, path:child.path})
            return crumbs
          }
        })
      }
    })
    return crumbs
  }
  return (
  <Box w="100%" h="100%" p={basePadding}>
    <HStack align='center' h="100%"  justify='space-between'>
      <HStack align="center">
        {
          getBreadcrumbs().map((crumb, index, crumbs) => (
            <HStack align='center' key={index}>
              {crumb.icon && <Iconify color="text.subtle" icon={crumb.icon}/>} 
              {index < crumbs.length-1 ?
              <Text fontSize='sm' color="text.subtle"><Link as={RouterLink} to={crumb.path}>{crumb.name}</Link>&nbsp; / </Text>
              :
              <Text fontSize='sm' color="text.subtle">{crumb.name}</Text>
              }
            </HStack>
          ))
        }
      </HStack>
      <HStack align='center'>
          {/* <ColorModeSwitcher/>
          <Button colorScheme='primary' size='sm' as={RouterLink} to="/app/upgrade">Go Pro</Button> */}
      </HStack>
    </HStack>
  </Box>
  )
}

function MobileHeader({toggleMenu, menuOpen}) {
  return (
    <Box w="100%" h="100%" p={basePadding} >
      <HStack align='center' h="100%"  justify='space-between'>
        <HStack align="center">
        <IconButton onClick={toggleMenu} variant='outline' icon={<Iconify size={20} icon={menuOpen ? "mdi:close" : "mdi:menu"}/>}/>
        <Logo size={7}/>
        </HStack>
        <HStack align='center'>
            <ColorModeSwitcher/>
            {/*<Button colorScheme='primary' size='sm' as={RouterLink} to="/app/upgrade">Go Pro</Button>*/}
        </HStack>
      </HStack>
    </Box>
    )
}

export function PageLayoutContained({size, left, children}) {
  const s = size === "sm" ? 786 : size === "md" ? 900 : 1200
  if (left) {
    return (
      <Box pl={basePadding} pr={basePadding} pt={3} maxW={s}>
        {children}
      </Box>
      )
  } else {
    return (
    <Container pl={basePadding} pr={basePadding} pt={3} maxW={s}>
      {children}
    </Container>
    )
  }
}

const bakeNavItems = (config, reports, orgs, user ) => {
  const navItems = deepCopy(config)
  reports.forEach(i => {navItems[1].children.push(i)})
  if (user?.admin) {
    navItems.push({path: "/app/admin", name: "Admin", icon: "ri:admin-fill"})
  }
  return navItems
}
export default function DashboardLayout() {

  const [isDesktop] = useMediaQuery('(min-width: 900px)')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const {refreshFilters, currentUser} = useContext(ColumnDataContext)
  const [organizations, setOrganizations] = useState(null)
  const {organization, setOrganization} = useContext(ColumnDataContext)
  const user = useUser()
  useEffect(() => {

    refreshFilters(user)

    if (organization === null || organization.id !== user.organization) {
        goFetch(user, 'GET', 'organization').then((response) => {
            console.log(response)
            setOrganization(response)
        });
    }

  }, []);

  useEffect(() => {
    if (currentUser !== null) {
      console.log(currentUser)
      if (currentUser.admin) {
        goFetch(user, 'GET', 'organizations').then((response) => {
          console.log(response)
          setOrganizations(response)
        });
      }
    }
  }, [currentUser])



  const location = useLocation()
  const vh100 = use100vh();
  const vh100m85 = use100vh(85);
  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen)
  }

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location]);

  useEffect(() => {

  }, [organizations, user])
  const reportItems = user.org.reports.map((d) => ({'name': d.name, 'path': '/app/reports/'+d.id}))
  const navItems = bakeNavItems(navItemConfig, reportItems, organizations, currentUser)
  const { isOpen, onOpen, onClose } = useDisclosure()
  const layoutRef = useRef()

  return (
    <Box> 
      {isDesktop &&
      <Grid 
      templateAreas={`"logo header"
                  "nav main"`}
      gridTemplateRows={'85px 1fr'}
      gridTemplateColumns={'300px 1fr'}
      h={'calc(100vh)'}
      w='100vw'
      maxW={'100%'}
      gap='0'>
        <GridItem area={'header'}>
          <Header navItems={navItems}/>
        </GridItem>
        <GridItem area={'logo'}>
          <LogoBlock/>
        </GridItem>
        <GridItem area={'nav'}>
          <NavBar navItems={navItems} currentUser={currentUser}  organizations={organizations} openOrgModal={onOpen} />
        </GridItem>
        <GridItem area={'main'} maxW={'calc(100vw - 315px)'} maxH={'calc(100vh - 85px)'} overflowY={'auto'}  ref={layoutRef}>
          <Outlet context={[layoutRef]} />
        </GridItem>

      </Grid>
      }
      {!isDesktop &&
      <Box w="100wv">
        <Box w="100vw" h="85px"></Box>
        <Box w="100vw" position="relative" ref={layoutRef}>
          <Outlet context={[layoutRef]} />
        </Box>
        <Box w="100vw" h="85px" position="fixed" top={0} left={0} right={0} bgColor="bg.default">
          <MobileHeader toggleMenu={toggleMobileMenu} menuOpen={mobileMenuOpen} />
        </Box>
        <Box display={mobileMenuOpen ? "block" : "none"} w="100vw" h={vh100m85} position="fixed" top="85px" left={0} right={0} bgColor="bg.default">
          <NavBar navItems={navItems} currentUser={currentUser} organizations={organizations} openOrgModal={onOpen} />
        </Box>
      </Box>
      }
      <ChangeOrganizationModal
          onOpen={onOpen}
          organizations={organizations}
          currentUser={currentUser}
          onClose={onClose}
          isOpen={isOpen}
      />
    </Box>
  );
}

