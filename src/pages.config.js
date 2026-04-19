/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import PatientDetail from './pages/PatientDetail';
import Appointments from './pages/Appointments';
import Dispensary from './pages/Dispensary';
import Bills from './pages/Bills';
import Prescriptions from './pages/Prescriptions';
import PrescriptionForm from './pages/PrescriptionForm';
import PrescriptionDetail from './pages/PrescriptionDetail';
import Staff from './pages/Staff';
import Settings from './pages/Settings';
import OPD from './pages/OPD';
import Master from './pages/Master';
import ImportExport from './pages/ImportExport';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Patients": Patients,
    "PatientDetail": PatientDetail,
    "Appointments": Appointments,
    "Dispensary": Dispensary,
    "Bills": Bills,
    "Prescriptions": Prescriptions,
    "PrescriptionForm": PrescriptionForm,
    "PrescriptionDetail": PrescriptionDetail,
    "Staff": Staff,
    "Settings": Settings,
    "OPD": OPD,
    "Master": Master,
    "ImportExport": ImportExport,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};
