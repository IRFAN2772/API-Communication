// Shared teaching contract; not a deployed GraphQL service.
export const lessonSchema = `
type Author { id: ID!, name: String! }
type Progress { percentComplete: Int! }
type Enrollment { id: ID!, courseId: ID!, learnerId: ID! }
type Course {
  id: ID!
  title: String!
  seats: Int!
  author: Author!
  progress: Progress
  enrollment: Enrollment
}
type CourseEdge { cursor: String!, node: Course! }
type PageInfo { hasNextPage: Boolean!, endCursor: String }
type CourseConnection { edges: [CourseEdge!]!, pageInfo: PageInfo! }
type Learner { id: ID!, enrollments: [Enrollment!]! }
input EnrollInput { courseId: ID!, idempotencyKey: String! }
input CourseInput { title: String!, seats: Int! }
input CoursePatchInput { title: String, seats: Int }
type EnrollmentPayload { enrollment: Enrollment!, course: Course! }
type Query {
  course(id: ID!): Course
  courses(first: Int! = 2, after: String): CourseConnection!
  me: Learner!
}
type Mutation {
  enroll(input: EnrollInput!): EnrollmentPayload
  createCourse(input: CourseInput!): Course!
  updateCourse(id: ID!, patch: CoursePatchInput!): Course
  deleteCourse(id: ID!): Boolean!
}
type Subscription { courseProgress(courseId: ID!): Progress! }
`;

// This fictional platform records preview progress separately from enrollment.
export const courseFixtures = [
  { id: "course-101", title: "API Fundamentals", seats: 30, authorId: "author-1", progress: { percentComplete: 20 }, enrollment: null },
  { id: "course-102", title: "REST Studio", seats: 20, authorId: "author-2", progress: null, enrollment: null },
];
export const authorFixtures = [
  { id: "author-1", name: "API Team" },
  { id: "author-2", name: "REST Team" },
];

export const lessonOperations = {
  course: `query CourseCard($id: ID!) { course(id: $id) { id title seats } }`,
  dashboard: `query Dashboard($id: ID!) { course(id: $id) { title seats author { name } progress { percentComplete } enrollment { id } } me { id } }`,
  catalogue: `query Catalogue($first: Int!) { courses(first: $first) { edges { node { id title author { name } } } pageInfo { hasNextPage endCursor } } }`,
  enroll: `mutation Enroll($input: EnrollInput!) { enroll(input: $input) { enrollment { id courseId learnerId } course { id seats } } }`,
  progress: `subscription Progress($courseId: ID!) { courseProgress(courseId: $courseId) { percentComplete } }`,
};
