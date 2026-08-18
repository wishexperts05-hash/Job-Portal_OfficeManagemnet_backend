import { connectMongo } from '../config/db.js';
import { env } from '../config/env.js';
import { User, SubscriptionPlan, JobCategory, CmsPage, PlatformSetting } from '../models/index.js';
import { ACCOUNT_TYPES, USER_STATUS } from '../constants/index.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import mongoose from 'mongoose';

async function seed() {
  await connectMongo();

  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
  await User.findOneAndUpdate(
    { email: env.ADMIN_EMAIL, accountType: ACCOUNT_TYPES.ADMIN },
    {
      $set: {
        email: env.ADMIN_EMAIL,
        accountType: ACCOUNT_TYPES.ADMIN,
        passwordHash,
        status: USER_STATUS.ACTIVE,
        preferredLocale: 'en',
        metadata: { name: env.ADMIN_NAME },
      },
    },
    { upsert: true, new: true },
  );
  console.log(`[seed] admin ready: ${env.ADMIN_EMAIL}`);

  await SubscriptionPlan.findOneAndUpdate(
    { code: 'FREE_LAUNCH' },
    {
      $set: {
        code: 'FREE_LAUNCH',
        nameEn: 'Free Launch',
        nameHi: 'मुफ़्त लॉन्च',
        descriptionEn: 'Free job posting during launch phase',
        descriptionHi: 'लॉन्च चरण में मुफ़्त जॉब पोस्टिंग',
        priceMonthly: 0,
        priceYearly: 0,
        jobPostLimit: -1,
        featuredJobLimit: 0,
        features: ['unlimited_jobs', 'office_dashboard'],
        isFree: true,
        isActive: true,
        sortOrder: 0,
      },
    },
    { upsert: true },
  );

  await SubscriptionPlan.findOneAndUpdate(
    { code: 'BASIC' },
    {
      $set: {
        code: 'BASIC',
        nameEn: 'Basic',
        nameHi: 'बेसिक',
        priceMonthly: 499,
        priceYearly: 4999,
        jobPostLimit: 10,
        featuredJobLimit: 1,
        features: ['10_jobs', 'office_dashboard'],
        isFree: false,
        isActive: true,
        sortOrder: 1,
      },
    },
    { upsert: true },
  );

  await SubscriptionPlan.findOneAndUpdate(
    { code: 'PRO' },
    {
      $set: {
        code: 'PRO',
        nameEn: 'Pro',
        nameHi: 'प्रो',
        priceMonthly: 1499,
        priceYearly: 14999,
        jobPostLimit: -1,
        featuredJobLimit: 10,
        features: ['unlimited_jobs', 'featured', 'office_dashboard', 'priority_support'],
        isFree: false,
        isActive: true,
        sortOrder: 2,
      },
    },
    { upsert: true },
  );
  console.log('[seed] subscription plans ready');

  // Wipe and reseed all hosiery / textile job categories
  await JobCategory.deleteMany({});
  console.log('[seed] old categories cleared');

  type CatSeed = {
    slug: string;
    nameEn: string;
    nameHi: string;
    descriptionEn?: string;
    children?: Array<{ slug: string; nameEn: string; nameHi: string }>;
  };

  const categoryTree: CatSeed[] = [
    {
      slug: 'helper-labour',
      nameEn: 'Helper & Labour',
      nameHi: 'हेल्पर और मजदूर',
      descriptionEn: 'Floor helpers, loaders and general labour roles',
      children: [
        { slug: 'floor-helper', nameEn: 'Floor Helper', nameHi: 'फ्लोर हेल्पर' },
        { slug: 'machine-helper', nameEn: 'Machine Helper', nameHi: 'मशीन हेल्पर' },
        { slug: 'loading-unloading', nameEn: 'Loading / Unloading Labour', nameHi: 'लोडिंग / अनलोडिंग मजदूर' },
        { slug: 'store-helper', nameEn: 'Store Helper', nameHi: 'स्टोर हेल्पर' },
        { slug: 'cleaning-housekeeping', nameEn: 'Cleaning & Housekeeping', nameHi: 'सफाई और हाउसकीपिंग' },
      ],
    },
    {
      slug: 'yarn-spinning',
      nameEn: 'Yarn & Spinning',
      nameHi: 'यार्न और स्पिनिंग',
      descriptionEn: 'Yarn store, winding and spinning related roles',
      children: [
        { slug: 'yarn-store-keeper', nameEn: 'Yarn Store Keeper', nameHi: 'यार्न स्टोर कीपर' },
        { slug: 'winding-operator', nameEn: 'Winding Operator', nameHi: 'वाइंडिंग ऑपरेटर' },
        { slug: 'cone-winding', nameEn: 'Cone Winding', nameHi: 'कोन वाइंडिंग' },
        { slug: 'yarn-checking', nameEn: 'Yarn Checking', nameHi: 'यार्न चेकिंग' },
      ],
    },
    {
      slug: 'knitting',
      nameEn: 'Knitting',
      nameHi: 'निटिंग / बुनाई',
      descriptionEn: 'Circular, flat and socks knitting production',
      children: [
        { slug: 'circular-knitting-operator', nameEn: 'Circular Knitting Operator', nameHi: 'सर्कुलर निटिंग ऑपरेटर' },
        { slug: 'flat-knitting-operator', nameEn: 'Flat Knitting Operator', nameHi: 'फ्लैट निटिंग ऑपरेटर' },
        { slug: 'socks-knitting-operator', nameEn: 'Socks Knitting Operator', nameHi: 'सॉक्स निटिंग ऑपरेटर' },
        { slug: 'jacquard-knitting', nameEn: 'Jacquard Knitting', nameHi: 'जैक्वार्ड निटिंग' },
        { slug: 'knitting-supervisor', nameEn: 'Knitting Supervisor', nameHi: 'निटिंग सुपरवाइज़र' },
        { slug: 'knitting-mechanic', nameEn: 'Knitting Mechanic', nameHi: 'निटिंग मैकेनिक' },
      ],
    },
    {
      slug: 'dyeing-processing',
      nameEn: 'Dyeing & Processing',
      nameHi: 'डाइंग और प्रोसेसिंग',
      descriptionEn: 'Fabric and garment dyeing, bleaching and processing',
      children: [
        { slug: 'fabric-dyeing-operator', nameEn: 'Fabric Dyeing Operator', nameHi: 'फैब्रिक डाइंग ऑपरेटर' },
        { slug: 'garment-dyeing', nameEn: 'Garment Dyeing', nameHi: 'गारमेंट डाइंग' },
        { slug: 'bleaching-operator', nameEn: 'Bleaching Operator', nameHi: 'ब्लीचिंग ऑपरेटर' },
        { slug: 'washing-operator', nameEn: 'Washing Operator', nameHi: 'वॉशिंग ऑपरेटर' },
        { slug: 'dyeing-supervisor', nameEn: 'Dyeing Supervisor', nameHi: 'डाइंग सुपरवाइज़र' },
        { slug: 'dyeing-chemist', nameEn: 'Dyeing Chemist / Lab', nameHi: 'डाइंग केमिस्ट / लैब' },
      ],
    },
    {
      slug: 'finishing',
      nameEn: 'Finishing',
      nameHi: 'फिनिशिंग',
      descriptionEn: 'Compacting, calendaring, heat setting and fabric finishing',
      children: [
        { slug: 'compactor-operator', nameEn: 'Compactor Operator', nameHi: 'कॉम्पैक्टर ऑपरेटर' },
        { slug: 'stenter-operator', nameEn: 'Stenter Operator', nameHi: 'स्टेंटर ऑपरेटर' },
        { slug: 'calendar-operator', nameEn: 'Calendar Operator', nameHi: 'कैलेंडर ऑपरेटर' },
        { slug: 'heat-setting', nameEn: 'Heat Setting', nameHi: 'हीट सेटिंग' },
        { slug: 'fabric-finishing-helper', nameEn: 'Fabric Finishing Helper', nameHi: 'फैब्रिक फिनिशिंग हेल्पर' },
      ],
    },
    {
      slug: 'cutting',
      nameEn: 'Cutting',
      nameHi: 'कटिंग',
      descriptionEn: 'Fabric spreading, cutting and layering',
      children: [
        { slug: 'fabric-cutter', nameEn: 'Fabric Cutter', nameHi: 'फैब्रिक कटर' },
        { slug: 'spreader', nameEn: 'Fabric Spreader', nameHi: 'फैब्रिक स्प्रेडर' },
        { slug: 'cutting-master', nameEn: 'Cutting Master', nameHi: 'कटिंग मास्टर' },
        { slug: 'pattern-cutter', nameEn: 'Pattern Cutter', nameHi: 'पैटर्न कटर' },
        { slug: 'cutting-supervisor', nameEn: 'Cutting Supervisor', nameHi: 'कटिंग सुपरवाइज़र' },
      ],
    },
    {
      slug: 'stitching-sewing',
      nameEn: 'Stitching & Sewing',
      nameHi: 'सिलाई',
      descriptionEn: 'Tailors, overlock, flatlock and sewing line roles',
      children: [
        { slug: 'sewing-operator', nameEn: 'Sewing Machine Operator', nameHi: 'सिलाई मशीन ऑपरेटर' },
        { slug: 'overlock-operator', nameEn: 'Overlock Operator', nameHi: 'ओवरलॉक ऑपरेटर' },
        { slug: 'flatlock-operator', nameEn: 'Flatlock Operator', nameHi: 'फ्लैटलॉक ऑपरेटर' },
        { slug: 'linker', nameEn: 'Linker', nameHi: 'लिंकर' },
        { slug: 'sample-tailor', nameEn: 'Sample Tailor', nameHi: 'सैंपल टेलर' },
        { slug: 'line-supervisor', nameEn: 'Line Supervisor', nameHi: 'लाइन सुपरवाइज़र' },
        { slug: 'floor-incharge-sewing', nameEn: 'Floor Incharge (Sewing)', nameHi: 'फ्लोर इंचार्ज (सिलाई)' },
      ],
    },
    {
      slug: 'checking-quality',
      nameEn: 'Checking & Quality Control',
      nameHi: 'चेकिंग और क्वालिटी कंट्रोल',
      descriptionEn: 'Inline, end-line and final quality checking',
      children: [
        { slug: 'inline-checker', nameEn: 'Inline Checker', nameHi: 'इनलाइन चेकर' },
        { slug: 'endline-checker', nameEn: 'End-line Checker', nameHi: 'एंडलाइन चेकर' },
        { slug: 'final-checker', nameEn: 'Final Checker', nameHi: 'फाइनल चेकर' },
        { slug: 'fabric-inspector', nameEn: 'Fabric Inspector', nameHi: 'फैब्रिक इंस्पेक्टर' },
        { slug: 'qc-executive', nameEn: 'QC Executive', nameHi: 'QC एग्जीक्यूटिव' },
        { slug: 'qa-manager', nameEn: 'QA Manager', nameHi: 'QA मैनेजर' },
      ],
    },
    {
      slug: 'ironing-packing',
      nameEn: 'Ironing, Packing & Dispatch',
      nameHi: 'इस्त्री, पैकिंग और डिस्पैच',
      descriptionEn: 'Pressing, packing, carton and dispatch roles',
      children: [
        { slug: 'iron-pressman', nameEn: 'Iron / Pressman', nameHi: 'इस्त्री / प्रेसमैन' },
        { slug: 'folder-packer', nameEn: 'Folder & Packer', nameHi: 'फोल्डर और पैकर' },
        { slug: 'polybag-packer', nameEn: 'Polybag Packer', nameHi: 'पॉलीबैग पैकर' },
        { slug: 'carton-packer', nameEn: 'Carton Packer', nameHi: 'कार्टन पैकर' },
        { slug: 'dispatch-executive', nameEn: 'Dispatch Executive', nameHi: 'डिस्पैच एग्जीक्यूटिव' },
        { slug: 'warehouse-incharge', nameEn: 'Warehouse Incharge', nameHi: 'वेयरहाउस इंचार्ज' },
      ],
    },
    {
      slug: 'machine-maintenance',
      nameEn: 'Machine & Maintenance',
      nameHi: 'मशीन और मेंटेनेंस',
      descriptionEn: 'Mechanics, electricians and maintenance staff',
      children: [
        { slug: 'knitting-machine-mechanic', nameEn: 'Knitting Machine Mechanic', nameHi: 'निटिंग मशीन मैकेनिक' },
        { slug: 'sewing-machine-mechanic', nameEn: 'Sewing Machine Mechanic', nameHi: 'सिलाई मशीन मैकेनिक' },
        { slug: 'electrician', nameEn: 'Electrician', nameHi: 'इलेक्ट्रीशियन' },
        { slug: 'boiler-operator', nameEn: 'Boiler Operator', nameHi: 'बॉयलर ऑपरेटर' },
        { slug: 'maintenance-supervisor', nameEn: 'Maintenance Supervisor', nameHi: 'मेंटेनेंस सुपरवाइज़र' },
      ],
    },
    {
      slug: 'design-sampling',
      nameEn: 'Design & Sampling',
      nameHi: 'डिज़ाइन और सैंपलिंग',
      descriptionEn: 'Fashion design, CAD, pattern and sampling',
      children: [
        { slug: 'fashion-designer', nameEn: 'Fashion / Knitwear Designer', nameHi: 'फैशन / निटवियर डिज़ाइनर' },
        { slug: 'cad-designer', nameEn: 'CAD Designer', nameHi: 'CAD डिज़ाइनर' },
        { slug: 'pattern-master', nameEn: 'Pattern Master', nameHi: 'पैटर्न मास्टर' },
        { slug: 'sample-coordinator', nameEn: 'Sample Coordinator', nameHi: 'सैंपल कोऑर्डिनेटर' },
        { slug: 'graphic-print-designer', nameEn: 'Graphic / Print Designer', nameHi: 'ग्राफिक / प्रिंट डिज़ाइनर' },
      ],
    },
    {
      slug: 'merchandising',
      nameEn: 'Merchandising',
      nameHi: 'मर्चेंडाइजिंग',
      descriptionEn: 'Buyer communication, costing and order follow-up',
      children: [
        { slug: 'junior-merchandiser', nameEn: 'Junior Merchandiser', nameHi: 'जूनियर मर्चेंडाइज़र' },
        { slug: 'merchandiser', nameEn: 'Merchandiser', nameHi: 'मर्चेंडाइज़र' },
        { slug: 'senior-merchandiser', nameEn: 'Senior Merchandiser', nameHi: 'सीनियर मर्चेंडाइज़र' },
        { slug: 'production-merchandiser', nameEn: 'Production Merchandiser', nameHi: 'प्रोडक्शन मर्चेंडाइज़र' },
        { slug: 'costing-executive', nameEn: 'Costing Executive', nameHi: 'कॉस्टिंग एग्जीक्यूटिव' },
      ],
    },
    {
      slug: 'production-planning',
      nameEn: 'Production & Planning',
      nameHi: 'प्रोडक्शन और प्लानिंग',
      descriptionEn: 'Production managers, IE and planning roles',
      children: [
        { slug: 'production-supervisor', nameEn: 'Production Supervisor', nameHi: 'प्रोडक्शन सुपरवाइज़र' },
        { slug: 'production-manager', nameEn: 'Production Manager', nameHi: 'प्रोडक्शन मैनेजर' },
        { slug: 'ie-executive', nameEn: 'IE Executive', nameHi: 'IE एग्जीक्यूटिव' },
        { slug: 'ppc-executive', nameEn: 'PPC Executive', nameHi: 'PPC एग्जीक्यूटिव' },
        { slug: 'factory-manager', nameEn: 'Factory Manager', nameHi: 'फैक्टरी मैनेजर' },
      ],
    },
    {
      slug: 'sales-marketing',
      nameEn: 'Sales & Marketing',
      nameHi: 'सेल्स और मार्केटिंग',
      descriptionEn: 'Domestic sales, export sales and brand marketing',
      children: [
        { slug: 'sales-executive', nameEn: 'Sales Executive', nameHi: 'सेल्स एग्जीक्यूटिव' },
        { slug: 'sales-manager', nameEn: 'Sales Manager', nameHi: 'सेल्स मैनेजर' },
        { slug: 'export-sales', nameEn: 'Export Sales Executive', nameHi: 'एक्सपोर्ट सेल्स एग्जीक्यूटिव' },
        { slug: 'marketing-executive', nameEn: 'Marketing Executive', nameHi: 'मार्केटिंग एग्जीक्यूटिव' },
        { slug: 'digital-marketing', nameEn: 'Digital Marketing', nameHi: 'डिजिटल मार्केटिंग' },
        { slug: 'business-development', nameEn: 'Business Development', nameHi: 'बिज़नेस डेवलपमेंट' },
      ],
    },
    {
      slug: 'purchase-sourcing',
      nameEn: 'Purchase & Sourcing',
      nameHi: 'परचेज और सोर्सिंग',
      descriptionEn: 'Yarn, fabric, trims and vendor sourcing',
      children: [
        { slug: 'purchase-executive', nameEn: 'Purchase Executive', nameHi: 'परचेज एग्जीक्यूटिव' },
        { slug: 'yarn-fabric-sourcing', nameEn: 'Yarn / Fabric Sourcing', nameHi: 'यार्न / फैब्रिक सोर्सिंग' },
        { slug: 'trims-accessories-purchase', nameEn: 'Trims & Accessories Purchase', nameHi: 'ट्रिम्स और एक्सेसरीज परचेज' },
        { slug: 'vendor-development', nameEn: 'Vendor Development', nameHi: 'वेंडर डेवलपमेंट' },
      ],
    },
    {
      slug: 'store-inventory',
      nameEn: 'Store & Inventory',
      nameHi: 'स्टोर और इन्वेंटरी',
      descriptionEn: 'Fabric store, accessories and inventory control',
      children: [
        { slug: 'fabric-store-keeper', nameEn: 'Fabric Store Keeper', nameHi: 'फैब्रिक स्टोर कीपर' },
        { slug: 'accessories-store', nameEn: 'Accessories Store Keeper', nameHi: 'एक्सेसरीज स्टोर कीपर' },
        { slug: 'inventory-executive', nameEn: 'Inventory Executive', nameHi: 'इन्वेंटरी एग्जीक्यूटिव' },
        { slug: 'godown-incharge', nameEn: 'Godown Incharge', nameHi: 'गोदाम इंचार्ज' },
      ],
    },
    {
      slug: 'hr-admin',
      nameEn: 'HR & Admin',
      nameHi: 'HR और एडमिन',
      descriptionEn: 'Recruitment, payroll and office administration',
      children: [
        { slug: 'hr-executive', nameEn: 'HR Executive', nameHi: 'HR एग्जीक्यूटिव' },
        { slug: 'hr-manager', nameEn: 'HR Manager', nameHi: 'HR मैनेजर' },
        { slug: 'payroll-executive', nameEn: 'Payroll Executive', nameHi: 'पेरोल एग्जीक्यूटिव' },
        { slug: 'admin-executive', nameEn: 'Admin Executive', nameHi: 'एडमिन एग्जीक्यूटिव' },
        { slug: 'time-office', nameEn: 'Time Office / Attendance', nameHi: 'टाइम ऑफिस / हाज़िरी' },
      ],
    },
    {
      slug: 'accounts-finance',
      nameEn: 'Accounts & Finance',
      nameHi: 'अकाउंट्स और फाइनेंस',
      descriptionEn: 'Accounts, billing, GST and finance roles',
      children: [
        { slug: 'accountant', nameEn: 'Accountant', nameHi: 'अकाउंटेंट' },
        { slug: 'accounts-executive', nameEn: 'Accounts Executive', nameHi: 'अकाउंट्स एग्जीक्यूटिव' },
        { slug: 'billing-executive', nameEn: 'Billing Executive', nameHi: 'बिलिंग एग्जीक्यूटिव' },
        { slug: 'gst-executive', nameEn: 'GST / Taxation Executive', nameHi: 'GST / टैक्सेशन एग्जीक्यूटिव' },
        { slug: 'finance-manager', nameEn: 'Finance Manager', nameHi: 'फाइनेंस मैनेजर' },
      ],
    },
    {
      slug: 'logistics-transport',
      nameEn: 'Logistics & Transport',
      nameHi: 'लॉजिस्टिक्स और ट्रांसपोर्ट',
      descriptionEn: 'Drivers, transporters and logistics coordination',
      children: [
        { slug: 'driver', nameEn: 'Driver', nameHi: 'ड्राइवर' },
        { slug: 'logistics-executive', nameEn: 'Logistics Executive', nameHi: 'लॉजिस्टिक्स एग्जीक्यूटिव' },
        { slug: 'transport-coordinator', nameEn: 'Transport Coordinator', nameHi: 'ट्रांसपोर्ट कोऑर्डिनेटर' },
        { slug: 'courier-documentation', nameEn: 'Courier & Documentation', nameHi: 'कूरियर और डॉक्यूमेंटेशन' },
      ],
    },
    {
      slug: 'it-systems',
      nameEn: 'IT & Systems',
      nameHi: 'IT और सिस्टम',
      descriptionEn: 'ERP, CAD systems and IT support for factories',
      children: [
        { slug: 'erp-operator', nameEn: 'ERP / Software Operator', nameHi: 'ERP / सॉफ्टवेयर ऑपरेटर' },
        { slug: 'it-support', nameEn: 'IT Support Executive', nameHi: 'IT सपोर्ट एग्जीक्यूटिव' },
        { slug: 'data-entry', nameEn: 'Data Entry Operator', nameHi: 'डेटा एंट्री ऑपरेटर' },
      ],
    },
    {
      slug: 'security-other',
      nameEn: 'Security & Other Roles',
      nameHi: 'सिक्योरिटी और अन्य भूमिकाएँ',
      descriptionEn: 'Security, canteen and miscellaneous unit roles',
      children: [
        { slug: 'security-guard', nameEn: 'Security Guard', nameHi: 'सिक्योरिटी गार्ड' },
        { slug: 'security-supervisor', nameEn: 'Security Supervisor', nameHi: 'सिक्योरिटी सुपरवाइज़र' },
        { slug: 'canteen-staff', nameEn: 'Canteen Staff', nameHi: 'कैंटीन स्टाफ' },
        { slug: 'office-boy', nameEn: 'Office Boy / Peon', nameHi: 'ऑफिस बॉय / चपरासी' },
      ],
    },
  ];

  let parentCount = 0;
  let childCount = 0;

  for (let i = 0; i < categoryTree.length; i++) {
    const parent = categoryTree[i];
    const parentDoc = await JobCategory.create({
      slug: parent.slug,
      nameEn: parent.nameEn,
      nameHi: parent.nameHi,
      descriptionEn: parent.descriptionEn,
      parentId: null,
      sortOrder: i + 1,
      isActive: true,
    });
    parentCount += 1;

    const children = parent.children ?? [];
    for (let j = 0; j < children.length; j++) {
      const child = children[j];
      await JobCategory.create({
        slug: child.slug,
        nameEn: child.nameEn,
        nameHi: child.nameHi,
        parentId: parentDoc._id,
        sortOrder: j + 1,
        isActive: true,
      });
      childCount += 1;
    }
  }

  console.log(`[seed] categories ready: ${parentCount} parents, ${childCount} subcategories`);

  // Clear cached category tree so portal/admin see fresh data
  try {
    const { getRedis, cacheKeys } = await import('../config/redis.js');
    await getRedis().del(cacheKeys.categories);
    console.log('[seed] category cache cleared');
  } catch {
    console.warn('[seed] could not clear category cache (redis may be offline)');
  }

  await CmsPage.findOneAndUpdate(
    { slug: 'about' },
    {
      $set: {
        slug: 'about',
        titleEn: 'About Us',
        titleHi: 'हमारे बारे में',
        bodyEn: 'Dedicated hosiery & textile industry job portal and office management platform.',
        bodyHi: 'होज़री और टेक्सटाइल उद्योग के लिए समर्पित जॉब पोर्टल और ऑफिस प्रबंधन प्लेटफ़ॉर्म।',
        isPublished: true,
      },
    },
    { upsert: true },
  );

  await PlatformSetting.findOneAndUpdate(
    { key: 'job_approval_required' },
    { $set: { value: true, group: 'jobs' } },
    { upsert: true },
  );
  await PlatformSetting.findOneAndUpdate(
    { key: 'launch_free_posting' },
    { $set: { value: true, group: 'subscriptions' } },
    { upsert: true },
  );
  await PlatformSetting.findOneAndUpdate(
    { key: 'registration_open' },
    { $set: { value: true, group: 'general' } },
    { upsert: true },
  );
  await PlatformSetting.findOneAndUpdate(
    { key: 'default_locale' },
    { $set: { value: 'en', group: 'general' } },
    { upsert: true },
  );

  const notificationDefaults: Array<{ key: string; value: boolean; group: string }> = [
    { key: 'notify_employer_job_approved', value: true, group: 'notifications' },
    { key: 'notify_employer_job_rejected', value: true, group: 'notifications' },
    { key: 'notify_employer_new_application', value: true, group: 'notifications' },
    { key: 'notify_seeker_application_updates', value: true, group: 'notifications' },
    { key: 'notify_seeker_new_job_alerts', value: true, group: 'notifications' },
    { key: 'notify_employee_task_assigned', value: true, group: 'notifications' },
    { key: 'notify_employee_added', value: true, group: 'notifications' },
    { key: 'notify_employee_salary_update', value: true, group: 'notifications' },
    { key: 'notify_admin_job_pending', value: true, group: 'notifications' },
    { key: 'notify_admin_incomplete_lead', value: true, group: 'notifications' },
    { key: 'notify_admin_lead_abandoned', value: true, group: 'notifications' },
    { key: 'notify_channel_in_app', value: true, group: 'notifications' },
    { key: 'notify_channel_push', value: true, group: 'notifications' },
    { key: 'notify_channel_email', value: true, group: 'notifications' },
  ];

  for (const item of notificationDefaults) {
    await PlatformSetting.findOneAndUpdate(
      { key: item.key },
      { $set: { value: item.value, group: item.group } },
      { upsert: true },
    );
  }

  console.log('[seed] CMS & settings ready');
  await mongoose.disconnect();
  console.log('[seed] done');
}

seed().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
