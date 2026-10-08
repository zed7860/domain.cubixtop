import { defineConfig } from '@playwright/test';
import { join } from 'node:path';
// Library tests must never open the development or production database.
process.env.DATA_DIRECTORY=join(process.cwd(),'.local','test-libraries-'+process.pid);
const serverDataDirectory=process.env.TEST_SERVER_DATA_DIRECTORY||join(process.cwd(),'.local','test-'+Date.now());
process.env.TEST_SERVER_DATA_DIRECTORY=serverDataDirectory;
export default defineConfig({testDir:'./tests',fullyParallel:false,workers:1,timeout:30000,use:{baseURL:'http://127.0.0.1:3003',channel:'msedge',headless:true,screenshot:'only-on-failure'},webServer:{command:'npm run start -- --hostname 127.0.0.1 --port 3003',url:'http://127.0.0.1:3003',reuseExistingServer:false,timeout:30000,env:{SMTP_HOST:'',ADMIN_EMAIL:'admin@cubixtop.com',NAMESILO_API_KEY:'',ADMIN_PASSWORD:'Test-Admin-Password-123456',DATA_DIRECTORY:serverDataDirectory,COOKIE_SECURE:'false'}},reporter:'list'});



