-- Sample rows so the dashboard has something to render before the first paste.
INSERT INTO jobs (posted_date, role, company, location, hr_name, hr_phone, reached)
VALUES
  ('2026-09-18', 'Senior Frontend Engineer', 'Vercel',            'Remote (IN)',        'Priya Nair',      '+91 98450 12345', false),
  ('2026-09-21', 'Product Designer',         'Razorpay',          'Bengaluru, IN',      'Ananya Rao',      '+91 99012 88771', true),
  ('2026-09-14', 'Backend Engineer',         'Posthog',           'Remote (EU/US)',     'Marc Delacroix',  '+33 6 12 34 56 78', false),
  ('2026-09-23', 'Data Analyst',             'CRED',              'Mumbai, IN',         'Rohan Mehta',     '+91 98200 45612', false),
  ('2026-09-09', 'Engineering Manager',      'Atlassian',         'Sydney / Remote',    'Sarah Whitcombe', '+61 412 345 678', true),
  ('2026-09-25', 'Full Stack Developer',     'Zerodha',           'Bengaluru, IN',      'Karthik Iyer',    '+91 88670 90123', false),
  ('2026-09-19', 'DevOps Engineer',          'Hasura',            'Remote (Global)',    'Neha Sharma',     '+91 97400 22119', false),
  ('2026-09-11', 'UX Researcher',            'Swiggy',            'Bengaluru, IN',      'Divya Menon',     '+91 90080 33445', false),
  ('2026-09-22', 'Machine Learning Engineer','Sarvam AI',         'Bengaluru, IN',      'Vikram Sethi',    '+91 99876 55443', false),
  ('2026-09-16', 'Technical Writer',         'GitBook',           'Remote (Global)',    'Lena Fischer',    '+49 151 23456789', true),
  ('2026-09-24', 'QA Automation Engineer',   'BrowserStack',      'Mumbai, IN',         'Amit Kulkarni',   '+91 98330 77665', false),
  ('2026-09-13', 'Android Developer',        'PhonePe',           'Bengaluru, IN',      'Sneha Pillai',    '+91 96320 11009', false)
ON CONFLICT (id) DO NOTHING;
