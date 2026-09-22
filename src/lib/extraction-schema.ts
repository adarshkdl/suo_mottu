import { z } from 'zod';

const ActRowSchema = z.object({
  act: z.string().describe('Name of the Act, e.g. "KERALA POLICE ACT, 2011"'),
  section: z.string().describe('Section number, e.g. "118(a)"'),
});

const AccusedRowSchema = z.object({
  name: z.string().describe('Full name of the accused/suspect'),
  alias: z.string().describe('Alias or nickname, empty string if none'),
  age: z.string().describe('Age as a string, empty string if unknown'),
  gender: z.string().describe('Gender of the accused (e.g. "Male", "Female"), empty string if unknown'),
  nationality: z.string().describe('Nationality of the accused, empty string if unknown (defaults to India if not specified)'),
  fatherName: z.string().describe("Father's name, empty string if unknown"),
  tel: z.string().describe('Phone number, empty string if unknown'),
  presentAddress: z.string().describe('Current address, empty string if unknown'),
  permanentAddress: z.string().describe('Permanent address, empty string if unknown'),
});

const PropertyRowSchema = z.object({
  propType: z.string().describe('Type of property, e.g. "Mobile Phone", "Cash"'),
  subType: z.string().describe('Sub-type/brand/model, empty string if none'),
  description: z.string().describe('Free-text description of the item'),
  value: z.string().describe('Estimated value in Rupees as a plain number string, empty string if unknown'),
});

export const ExtractionSchema = z.object({
  district: z.string().describe('Police district, e.g. "TRIVANDRUM CITY", empty string if unknown'),
  ps: z.string().describe('Police station name, e.g. "KARAMANA", empty string if unknown'),

  occDay: z.string().describe('Day of the week the incident occurred, e.g. "Thursday", empty string if unknown'),
  occDateFrom: z.string().describe('Incident start date in YYYY-MM-DD format, empty string if unknown'),
  occTimeFrom: z.string().describe('Incident start time in HH:MM 24-hour format, empty string if unknown'),
  occDateTo: z.string().describe('Incident end date in YYYY-MM-DD format, empty string if same as start or unknown'),
  occTimeTo: z.string().describe('Incident end time in HH:MM 24-hour format, empty string if unknown'),

  direction: z.string().describe('Direction and distance from the police station, e.g. "SOUTH-EAST, 0.5 KM", empty string if unknown'),
  location: z.string().describe('Location/address where the incident occurred'),

  accusedTable: z.array(AccusedRowSchema).describe('List of accused/suspects mentioned in the description'),
  actsTable: z.array(ActRowSchema).describe('Applicable Acts and Sections implied by the incident, if determinable'),
  propertyTable: z.array(PropertyRowSchema).describe('Any stolen/involved property mentioned'),

  delayReason: z.string().describe('Reason for delay in reporting, if mentioned, empty string otherwise'),
  narrative: z.string().describe('A clean, well-formed First Information Contents narrative summarizing the incident, written in formal police report style'),
});

export type ExtractionResult = z.infer<typeof ExtractionSchema>;
